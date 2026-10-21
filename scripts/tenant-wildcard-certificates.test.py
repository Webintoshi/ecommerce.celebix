"""Offline certificate and publication tests. No Docker, ACME or DNS calls."""
import importlib.util,pathlib,subprocess,tempfile,unittest,os,json
from unittest.mock import patch
MODULE=pathlib.Path(__file__).with_name('tenant-wildcard-certificates.py')
spec=importlib.util.spec_from_file_location('wildcard_certificates',MODULE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Certificates(unittest.TestCase):
 def test_lego_command_is_digest_pinned_file_secret_only_and_renewal_is_bounded(self):
  cmd=m.lego_command('net','renew','goacme/lego:v4.35.2@sha256:'+'a'*64,'ops@example.test',pathlib.Path('/private/token'),pathlib.Path('/private/state'))
  self.assertEqual(cmd[-4:],['renew','--days','30','--ari-disable'])
  self.assertIn('CF_DNS_API_TOKEN_FILE=/run/secrets/cloudflare-token',cmd)
  self.assertIn('type=bind,source=/private/state,target=/var/lib/lego',cmd)
  self.assertEqual(cmd[cmd.index('--path')+1],'/var/lib/lego')
  self.assertNotIn('docker.sock',' '.join(cmd));self.assertNotIn('--privileged',cmd)
  self.assertEqual([cmd[i+1]for i,x in enumerate(cmd)if x=='--domains'],['*.saas-staging.celebix.net','*.admin.saas-staging.celebix.net'])
  for image in ['goacme/lego:latest','other/lego@sha256:'+'a'*64,'goacme/lego:v5.0.0@sha256:'+'a'*64]:
   with self.assertRaises(m.CertificateError):m.lego_command('net','renew',image,'ops@example.test',pathlib.Path('/private/token'),pathlib.Path('/private/state'))
 def test_failure_codes_are_finite_and_never_echo_provider_text(self):
  self.assertEqual(m.failure_code(m.CertificateError('certificate_key_mismatch')),'certificate_key_mismatch')
  self.assertEqual(m.failure_code(m.CertificateError('provider SECRET raw response')),'wildcard_certificate_operation_failed')
  self.assertEqual(m.failure_code(OSError('SECRET')),'wildcard_certificate_operation_failed')
 def test_only_exact_two_dns_sans_for_the_zone_are_accepted(self):
  expected=m.ZONES['net']
  self.assertEqual(m.parse_sans('X509v3 Subject Alternative Name:\n DNS:'+expected[0]+', DNS:'+expected[1]),set(expected))
  for text in ['X509v3 Subject Alternative Name:\n DNS:'+expected[0], 'X509v3 Subject Alternative Name:\n DNS:'+expected[0]+', IP Address:127.0.0.1']:
   with self.assertRaises(m.CertificateError):m.require_sans(text,expected)

class CryptoFixture(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.folder=tempfile.TemporaryDirectory(prefix='wildcard-offline-');cls.root=pathlib.Path(cls.folder.name).resolve()
  cls.ca_key=cls.root/'ca.key';cls.ca=cls.root/'ca.pem';conf=cls.root/'ca.conf'
  conf.write_text('[req]\ndistinguished_name=dn\nx509_extensions=v3_ca\nprompt=no\n[dn]\nCN=Offline Wildcard Fixture CA\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n')
  cls.openssl('ecparam','-name','prime256v1','-genkey','-noout','-out',str(cls.ca_key))
  cls.openssl('req','-new','-x509','-sha256','-key',str(cls.ca_key),'-days','365','-config',str(conf),'-out',str(cls.ca))
 @classmethod
 def tearDownClass(cls):cls.folder.cleanup()
 @staticmethod
 def openssl(*args):
  result=subprocess.run(['openssl',*args],capture_output=True)
  if result.returncode:raise RuntimeError('offline openssl fixture failed: '+result.stderr.decode())
  return result.stdout
 def setUp(self):
  self.case=tempfile.TemporaryDirectory(dir=self.root);self.directory=pathlib.Path(self.case.name);self.addCleanup(self.case.cleanup)
 def certificate(self,zone='net',days=90,sans=None):
  where=self.directory/str(len(list(self.directory.iterdir())));where.mkdir(mode=0o700)
  key=where/'key.pem';leaf=where/'leaf.pem';csr=where/'request.pem';ext=where/'ext.conf';chain=where/'fullchain.pem'
  self.openssl('ecparam','-name','prime256v1','-genkey','-noout','-out',str(key))
  self.openssl('req','-new','-key',str(key),'-subj','/CN=Offline Wildcard Fixture','-out',str(csr))
  names=sans if sans is not None else m.ZONES[zone]
  ext.write_text('basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName='+','.join('DNS:'+x for x in names)+'\n')
  self.openssl('x509','-req','-sha256','-in',str(csr),'-CA',str(self.ca),'-CAkey',str(self.ca_key),'-set_serial','1','-days',str(days),'-extfile',str(ext),'-out',str(leaf))
  chain.write_bytes(leaf.read_bytes()+self.ca.read_bytes());chain.chmod(0o600);key.chmod(0o600)
  return chain,key

class CertificateCrypto(CryptoFixture):
 def test_publication_validation_accepts_trusted_exact_sans_matching_key_and_thirty_days(self):
  chain,key=self.certificate()
  result=m.validate_certificate(chain,key,m.ZONES['net'],self.ca)
  self.assertEqual(result['fullchain'],chain.read_bytes());self.assertEqual(result['key'],key.read_bytes())
 def test_mismatched_key_untrusted_chain_short_life_and_extra_san_are_rejected(self):
  chain,key=self.certificate();_,wrong=self.certificate()
  for cert,k,trust,names in[(chain,wrong,self.ca,m.ZONES['net']),(*self.certificate(days=29),self.ca,m.ZONES['net']),(*self.certificate(sans=(*m.ZONES['net'],'*.extra.example.test')),self.ca,m.ZONES['net']),(chain,key,self.ca,m.ZONES['site'])]:
   with self.assertRaises(m.CertificateError):m.validate_certificate(cert,k,names,trust)
  empty=self.directory/'untrusted.pem';empty.write_text('')
  with self.assertRaises(m.CertificateError):m.validate_certificate(chain,key,m.ZONES['net'],empty)

class Publication(CryptoFixture):
 def layout(self):
  base=self.directory/'managed';dynamic=self.directory/'dynamic'/'wildcard.yml';dynamic.parent.mkdir()
  m.prepare_layout(base,dynamic)
  for zone in m.ZONES:self.stage(base,zone)
  return base,dynamic
 def stage(self,base,zone,wrong_key=False):
  cert,key=self.certificate(zone);chain_path,key_path=m.state_files(base,zone);chain_path.parent.mkdir(mode=0o700,exist_ok=True)
  chain_path.write_bytes(cert.read_bytes());key_path.write_bytes(key.read_bytes()if not wrong_key else self.certificate(zone)[1].read_bytes())
  chain_path.chmod(0o600);key_path.chmod(0o600)
 def test_all_four_names_publish_immutable_versions_once_without_touching_other_proxy_files(self):
  base,dynamic=self.layout();other=dynamic.parent/'existing-router.yml';other.write_bytes(b'original-router');acme=self.directory/'acme.json';acme.write_bytes(b'existing-acme')
  self.assertTrue(m.publish(base,dynamic,self.ca));saved=dynamic.read_bytes();self.assertFalse(m.publish(base,dynamic,self.ca));self.assertEqual(dynamic.read_bytes(),saved)
  config=json.loads(saved.removeprefix(m.MARKER));self.assertEqual(set(config),{'tls'});self.assertEqual(set(config['tls']),{'certificates'});self.assertEqual(len(config['tls']['certificates']),2)
  self.assertEqual(other.read_bytes(),b'original-router');self.assertEqual(acme.read_bytes(),b'existing-acme')
  for p in(base/'published').rglob('*.pem'):self.assertEqual(p.stat().st_mode&0o777,0o600)
 def test_failed_zone_validation_and_failed_atomic_replace_preserve_active_bytes(self):
  base,dynamic=self.layout();m.publish(base,dynamic,self.ca);before=dynamic.read_bytes();self.stage(base,'site',True)
  with self.assertRaises(m.CertificateError):m.publish(base,dynamic,self.ca)
  self.assertEqual(dynamic.read_bytes(),before)
  self.stage(base,'site')
  with patch.object(m.os,'replace',side_effect=OSError('offline injected atomic failure')),self.assertRaises(OSError):m.publish(base,dynamic,self.ca)
  self.assertEqual(dynamic.read_bytes(),before)
 def test_unowned_config_and_symlinked_key_are_never_replaced(self):
  base,dynamic=self.layout();dynamic.write_text('tls: existing-non-manager-config');dynamic.chmod(0o600)
  with self.assertRaises(m.CertificateError):m.publish(base,dynamic,self.ca)
  self.assertEqual(dynamic.read_text(),'tls: existing-non-manager-config')
  dynamic.unlink();_,key=m.state_files(base,'net');copied=self.directory/'other.key';copied.write_bytes(key.read_bytes());copied.chmod(0o600);key.unlink();key.symlink_to(copied)
  with self.assertRaises(m.CertificateError):m.publish(base,dynamic,self.ca)
  self.assertFalse(dynamic.exists())

 def test_failed_renewal_preserves_active_config_but_attempts_the_other_zone(self):
  base,dynamic=self.layout();m.publish(base,dynamic,self.ca);before=dynamic.read_bytes()
  for zone in m.ZONES:
   chain,_=m.state_files(base,zone);chain.with_suffix('.json').write_text('{}')
  config={'legoImage':'goacme/lego:v4.35.2@sha256:'+'a'*64,'email':'ops@example.test','cloudflareTokenFile':'/private/token'}
  renewed=[]
  def provider(command,code,timeout):
   if command[command.index('--name')+1].endswith('net'):raise m.CertificateError('offline_dns_failure')
   self.stage(base,'site');renewed.append(m.state_files(base,'site')[0].read_bytes());return b''
  with self.assertRaises(m.CertificateError):m.cycle(config,'renew',base,dynamic,self.ca,provider)
  self.assertTrue(renewed);self.assertEqual(dynamic.read_bytes(),before)
 def test_missing_renewal_state_cannot_silently_issue_a_new_certificate(self):
  base,dynamic=self.layout();config={'legoImage':'goacme/lego:v4.35.2@sha256:'+'a'*64,'email':'ops@example.test','cloudflareTokenFile':'/private/token'}
  def never_issue(*args,**kwargs):raise AssertionError('missing metadata must fail before any ACME command')
  with self.assertRaises(m.CertificateError):m.cycle(config,'renew',base,dynamic,self.ca,never_issue)
  self.assertFalse(dynamic.exists())

 def test_symlinked_lego_state_is_rejected_before_the_container_can_use_it(self):
  base,dynamic=self.layout()
  for zone in m.ZONES:
   chain,key=m.state_files(base,zone);chain.with_suffix('.json').write_text('{}');target=self.directory/(zone+'-other.key');target.write_bytes(key.read_bytes());key.unlink();key.symlink_to(target)
  config={'legoImage':'goacme/lego:v4.35.2@sha256:'+'a'*64,'email':'ops@example.test','cloudflareTokenFile':'/private/token'}
  def never_start(*args,**kwargs):raise AssertionError('unsafe managed state must be rejected before Docker')
  with self.assertRaises(m.CertificateError):m.cycle(config,'renew',base,dynamic,self.ca,never_start)
  self.assertFalse(dynamic.exists())
if __name__=='__main__':unittest.main()
