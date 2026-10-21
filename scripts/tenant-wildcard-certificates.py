#!/usr/bin/env python3
"""ROOT-operated external wildcard TLS. Import/plan perform no DNS or Docker operation."""
import argparse,contextlib,fcntl,hashlib,json,os,pathlib,re,stat,subprocess,tempfile

PROXY=pathlib.Path('/data/coolify/proxy')
BASE=PROXY/'celebix-wildcard-tls'
DYNAMIC=PROXY/'dynamic/celebix-tenant-wildcard-tls.yml'
CONTAINER_BASE='/traefik/celebix-wildcard-tls'
TRUST=pathlib.Path('/etc/ssl/certs/ca-certificates.crt')
MARKER=b'# Managed exclusively by celebix tenant-wildcard-certificates v1\n'
ZONES={zone:(f'*.saas-staging.celebix.{zone}',f'*.admin.saas-staging.celebix.{zone}')for zone in['net','site']}
ENV={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','TZ':'UTC'}
class CertificateError(Exception):pass
# Only source-defined codes can cross the logging boundary, never provider text.
FAILURE_CODES=frozenset("""lego_contract_invalid email_invalid mount_path_invalid certificate_sans_missing certificate_sans_invalid certificate_sans_duplicate certificate_sans_mismatch path_invalid symlink_refused private_directory_required private_file_required file_changed fullchain_required system_trust_required certificate_invalid certificate_less_than_thirty_days certificate_chain_untrusted private_key_invalid certificate_key_mismatch proxy_mount_missing dynamic_provider_missing unowned_dynamic_file managed_dynamic_file_invalid immutable_version_changed dynamic_file_changed lego_state_unsafe phase_invalid lego_state_partial lego_state_missing lego_net_failed lego_site_failed lego_zone_failed_net lego_zone_failed_site lego_zone_failed_net,site manager_lock_invalid manager_busy manager_lock_changed config_invalid token_must_be_outside_proxy_mount root_private_token_file_required plan_never_applies root_reviewed_apply_required""".split())
def failure_code(error):
 return str(error)if isinstance(error,CertificateError)and str(error)in FAILURE_CODES else'wildcard_certificate_operation_failed'
def require(ok,code):
 if not ok:raise CertificateError(code)
def image_valid(image):return isinstance(image,str)and re.fullmatch(r'goacme/lego:v4\.\d+\.\d+@sha256:[a-f0-9]{64}',image)is not None
def lego_command(zone,action,image,email,token,state):
 require(zone in ZONES and action in['run','renew']and image_valid(image),'lego_contract_invalid')
 require(re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,63}',email)is not None,'email_invalid')
 for p in[token,state]:require(p.is_absolute()and not any(c in str(p)for c in',\n\r\\')and '..'not in p.parts,'mount_path_invalid')
 args=['docker','run','--rm','--pull','never','--name','celebix-tenant-wildcard-'+zone,'--label','celebix.manager=tenant-wildcard-certificates-v1','--user','0:0','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--mount',f'type=bind,source={state},target=/var/lib/lego','--mount',f'type=bind,source={token},target=/run/secrets/cloudflare-token,readonly','--env','CF_DNS_API_TOKEN_FILE=/run/secrets/cloudflare-token',image,'--path','/var/lib/lego','--accept-tos','--email',email,'--dns','cloudflare','--server','https://acme-v02.api.letsencrypt.org/directory','--key-type','ec256']
 for domain in ZONES[zone]:args+=['--domains',domain]
 return args+(['run']if action=='run'else['renew','--days','30','--ari-disable'])
def parse_sans(text):
 require('X509v3 Subject Alternative Name:'in text,'certificate_sans_missing')
 part=text.split('X509v3 Subject Alternative Name:',1)[1]
 # Only the indented GeneralName line(s), before the next extension/signature.
 lines=[]
 for line in part.splitlines():
  if not line.strip():continue
  if line.strip().startswith(('X509v3 ','Signature Algorithm:')):break
  lines.append(line.strip())
 entries=[x.strip()for x in' '.join(lines).split(',')]
 require(entries and all(re.fullmatch(r'DNS:\*\.[a-z0-9.-]+',x)for x in entries),'certificate_sans_invalid')
 names=[x[4:]for x in entries];require(len(names)==len(set(names)),'certificate_sans_duplicate');return set(names)
def require_sans(text,expected):require(parse_sans(text)==set(expected),'certificate_sans_mismatch')
def run(args,code,timeout=30):
 try:p=subprocess.run(args,capture_output=True,timeout=timeout,env=ENV)
 except(subprocess.TimeoutExpired,OSError):raise CertificateError(code)from None
 require(p.returncode==0,code);return p.stdout

def no_symlinks(path):
 require(path.is_absolute()and '..'not in path.parts,'path_invalid')
 for part in[*reversed(path.parents),path]:
  if part.exists()or part.is_symlink():require(not part.is_symlink(),'symlink_refused')
def private_directory(path,create=False):
 no_symlinks(path)
 if create and not path.exists():path.mkdir(mode=0o700)
 info=path.stat();require(stat.S_ISDIR(info.st_mode)and info.st_uid==os.geteuid()and stat.S_IMODE(info.st_mode)==0o700,'private_directory_required')
def private_bytes(path,maximum=131072):
 no_symlinks(path);info=path.lstat()
 require(stat.S_ISREG(info.st_mode)and info.st_uid==os.geteuid()and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and 0<info.st_size<=maximum,'private_file_required')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb')as f:
  opened=os.fstat(f.fileno());require((opened.st_dev,opened.st_ino)==(info.st_dev,info.st_ino),'file_changed');return f.read(maximum+1)
def exclusive_file(path,data):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(data);f.flush();os.fsync(f.fileno())
def fsync_directory(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
def validate_certificate(chain_path,key_path,expected,trust=TRUST):
 fullchain=private_bytes(chain_path);key=private_bytes(key_path,16384)
 pem=re.compile(rb'-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*')
 certs=pem.findall(fullchain);require(2<=len(certs)<=5 and not pem.sub(b'',fullchain).strip(),'fullchain_required')
 require(trust.is_file()and not trust.is_symlink(),'system_trust_required')
 with tempfile.TemporaryDirectory(prefix='celebix-wildcard-verify-')as directory:
  folder=pathlib.Path(directory);leaf=folder/'leaf.pem';issuers=folder/'issuers.pem';private=folder/'key.pem'
  for location,data in[(leaf,certs[0]),(issuers,b''.join(certs[1:])),(private,key)]:exclusive_file(location,data)
  text=run(['openssl','x509','-in',str(leaf),'-noout','-text'],'certificate_invalid').decode('ascii')
  require_sans(text,expected)
  run(['openssl','x509','-in',str(leaf),'-noout','-checkend',str(30*86400)],'certificate_less_than_thirty_days')
  run(['openssl','verify','-purpose','sslserver','-CAfile',str(trust),'-untrusted',str(issuers),str(leaf)],'certificate_chain_untrusted')
  public=run(['openssl','x509','-in',str(leaf),'-pubkey','-noout'],'certificate_invalid')
  actual=run(['openssl','pkey','-in',str(private),'-pubout'],'private_key_invalid')
  require(public==actual,'certificate_key_mismatch')
 return {'fullchain':fullchain,'key':key,'sha256':hashlib.sha256(fullchain).hexdigest()}

def prepare_layout(base=BASE,dynamic=DYNAMIC):
 no_symlinks(base.parent);require(base.parent.is_dir(),'proxy_mount_missing')
 no_symlinks(dynamic.parent);require(dynamic.parent.is_dir(),'dynamic_provider_missing')
 private_directory(base,True)
 for parent in[base/'state',base/'published']:
  private_directory(parent,True)
  for zone in ZONES:private_directory(parent/zone,True)
def state_files(base,zone):
 prefix=ZONES[zone][0].replace('*','_');folder=base/'state'/zone/'certificates';return folder/(prefix+'.crt'),folder/(prefix+'.key')
def managed_document(path):
 if not path.exists()and not path.is_symlink():return None
 data=private_bytes(path,16384);require(data.startswith(MARKER),'unowned_dynamic_file')
 try:document=json.loads(data[len(MARKER):])
 except(ValueError,UnicodeError):raise CertificateError('managed_dynamic_file_invalid')from None
 require(isinstance(document,dict)and set(document)=={'tls'}and isinstance(document['tls'],dict)and set(document['tls'])=={'certificates'},'managed_dynamic_file_invalid')
 entries=document['tls']['certificates'];require(isinstance(entries,list)and len(entries)==2,'managed_dynamic_file_invalid')
 for zone,entry in zip(ZONES,entries):
  require(isinstance(entry,dict)and set(entry)=={'certFile','keyFile'},'managed_dynamic_file_invalid')
  cert=entry['certFile'];require(isinstance(cert,str)and re.fullmatch(re.escape(CONTAINER_BASE+'/published/'+zone+'/')+r'[a-f0-9]{64}/fullchain\.pem',cert)is not None,'managed_dynamic_file_invalid')
  require(entry['keyFile']==cert.removesuffix('fullchain.pem')+'key.pem','managed_dynamic_file_invalid')
 return data
def immutable_version(base,zone,validated):
 version=hashlib.sha256(validated['fullchain']+validated['key']).hexdigest();parent=base/'published'/zone;location=parent/version
 if location.exists()or location.is_symlink():
  private_directory(location);require(set(p.name for p in location.iterdir())=={'fullchain.pem','key.pem'},'immutable_version_changed')
  require(private_bytes(location/'fullchain.pem')==validated['fullchain']and private_bytes(location/'key.pem',16384)==validated['key'],'immutable_version_changed')
 else:
  temporary=pathlib.Path(tempfile.mkdtemp(prefix='.unpublished-',dir=parent))
  exclusive_file(temporary/'fullchain.pem',validated['fullchain']);exclusive_file(temporary/'key.pem',validated['key']);fsync_directory(temporary)
  os.rename(temporary,location);fsync_directory(parent)
 prefix=CONTAINER_BASE+'/published/'+zone+'/'+version
 return {'certFile':prefix+'/fullchain.pem','keyFile':prefix+'/key.pem'}
def publish(base=BASE,dynamic=DYNAMIC,trust=TRUST):
 private_directory(base);before=managed_document(dynamic)
 # Freeze and validate both pairs before creating any new publication or changing the active file.
 validated={zone:validate_certificate(*state_files(base,zone),ZONES[zone],trust)for zone in ZONES}
 entries=[immutable_version(base,zone,validated[zone])for zone in ZONES]
 data=MARKER+(json.dumps({'tls':{'certificates':entries}},indent=2)+'\n').encode()
 if data==before:return False
 fd,name=tempfile.mkstemp(prefix='.celebix-wildcard-',suffix='.pending',dir=dynamic.parent);temporary=pathlib.Path(name)
 try:
  os.fchmod(fd,0o600)
  with os.fdopen(fd,'wb')as f:f.write(data);f.flush();os.fsync(f.fileno())
  require(managed_document(dynamic)==before,'dynamic_file_changed')
  os.replace(temporary,dynamic);fsync_directory(dynamic.parent)
 finally:
  if temporary.exists():temporary.unlink()
 return True

def harden_state(folder):
 private_directory(folder)
 for directory,subdirs,files in os.walk(folder,followlinks=False):
  for name in[subdirs,files]:
   for entry in name:
    location=pathlib.Path(directory)/entry;info=location.lstat()
    require(not stat.S_ISLNK(info.st_mode)and info.st_uid==os.geteuid()and(stat.S_ISDIR(info.st_mode)or stat.S_ISREG(info.st_mode)and info.st_nlink==1),'lego_state_unsafe')
    os.chmod(location,0o700 if stat.S_ISDIR(info.st_mode)else 0o600)
def cycle(config,phase,base=BASE,dynamic=DYNAMIC,trust=TRUST,runner=run):
 require(phase in['issue','renew'],'phase_invalid');failed=[]
 for zone in ZONES:
  try:
   harden_state(base/'state'/zone)
   chain,key=state_files(base,zone);resources=[chain,key,chain.with_suffix('.json')];exists=[p.exists()or p.is_symlink()for p in resources]
   require(all(exists)or not any(exists),'lego_state_partial')
   require(phase=='issue'or all(exists),'lego_state_missing')
   action='renew'if all(exists)else'run'
   runner(lego_command(zone,action,config['legoImage'],config['email'],pathlib.Path(config['cloudflareTokenFile']),base/'state'/zone),'lego_'+zone+'_failed',timeout=1500)
   harden_state(base/'state'/zone)
  except(CertificateError,OSError):failed.append(zone)
 require(not failed,'lego_zone_failed_'+','.join(failed))
 return publish(base,dynamic,trust)
@contextlib.contextmanager
def manager_lock(base=BASE):
 location=base/'.manager.lock';no_symlinks(location);fd=os.open(location,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
 try:
  info=os.fstat(fd);require(stat.S_ISREG(info.st_mode)and info.st_uid==os.geteuid()and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1,'manager_lock_invalid')
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise CertificateError('manager_busy')from None
  require(location.stat().st_ino==info.st_ino,'manager_lock_changed');yield
 finally:os.close(fd)
def load_config(path):
 try:config=json.loads(private_bytes(path,16384))
 except(ValueError,UnicodeError):raise CertificateError('config_invalid')from None
 require(isinstance(config,dict)and set(config)=={'schemaVersion','rootReviewed','legoImage','email','cloudflareTokenFile'}and config['schemaVersion']==1 and type(config['rootReviewed'])is bool,'config_invalid')
 # Command construction validates image, email and bind syntax without reading the token.
 token=pathlib.Path(config['cloudflareTokenFile']);require(not token.is_relative_to(PROXY),'token_must_be_outside_proxy_mount')
 lego_command('net','renew',config['legoImage'],config['email'],token,BASE/'state/net');return config
def check_token(path):
 no_symlinks(path);info=path.lstat()
 require(stat.S_ISREG(info.st_mode)and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and 1<=info.st_size<=4096,'root_private_token_file_required')
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('phase',choices=['plan','issue','renew','publish']);parser.add_argument('--config',required=True,type=pathlib.Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 try:
  config=load_config(args.config)
  if args.phase=='plan':
   require(not args.apply,'plan_never_applies');print(json.dumps({'rootSoleLiveOperator':True,'domains':ZONES,'renewCommands':[lego_command(zone,'renew',config['legoImage'],config['email'],pathlib.Path(config['cloudflareTokenFile']),BASE/'state'/zone)for zone in ZONES],'networkOperations':0}));return
  require(os.geteuid()==0 and args.apply and config['rootReviewed']is True,'root_reviewed_apply_required')
  check_token(pathlib.Path(config['cloudflareTokenFile']));prepare_layout()
  with manager_lock():changed=publish()if args.phase=='publish'else cycle(config,args.phase)
  print(json.dumps({'phase':args.phase,'published':changed,'wildcards':4,'proxyRestarted':False}))
 except(CertificateError,OSError,ValueError,TypeError,KeyError)as error:
  # Provider stdout/stderr, key bytes and token contents are deliberately never emitted.
  print(json.dumps({'status':'failed','code':failure_code(error),'activeConfigPreservedUnlessAtomicPublicationCompleted':True}));raise SystemExit(1)from None
if __name__=='__main__':main()
