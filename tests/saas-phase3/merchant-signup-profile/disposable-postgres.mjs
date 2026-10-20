import assert from 'node:assert/strict';
import {accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir, tmpdir} from 'node:os';
import path from 'node:path';

const programs = ['initdb', 'pg_ctl', 'psql', 'createdb'];
const cleanEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !key.endsWith('DATABASE_URL') && !['LD_PRELOAD','DYLD_INSERT_LIBRARIES'].includes(key)));

function validateBin(directory) {
  const bin = realpathSync(directory);
  for (const program of programs) {
    const executable = path.join(bin, program);
    accessSync(executable, constants.X_OK);
    const result = spawnSync(executable, ['--version'], {encoding:'utf8', timeout:10000, env:cleanEnvironment()});
    assert.equal(result.status, 0, `${program} version unavailable`);
    assert.match(result.stdout, /\(PostgreSQL\) 16(?:\.|\b)/, `${program} must be PostgreSQL 16`);
  }
  return bin;
}

/** An explicit override fails closed; automatic discovery never uses a database URL. */
export function resolvePostgres16Bin() {
  if (process.env.CELEBIX_TEST_PG_BIN) return validateBin(process.env.CELEBIX_TEST_PG_BIN);
  const candidates = [];
  const config = spawnSync('pg_config', ['--bindir'], {encoding:'utf8', timeout:10000, env:cleanEnvironment()});
  if (config.status === 0) candidates.push(config.stdout.trim());
  const local = path.join(homedir(), '.codex/tmp');
  if (existsSync(local)) candidates.push(...readdirSync(local).filter(name => /^postgresql-16\..*-install$/.test(name)).sort().reverse().map(name => path.join(local,name,'bin')));
  for (const candidate of candidates) {
    try { return validateBin(candidate); } catch { /* Try the next complete PG16 installation. */ }
  }
  throw new Error('DISPOSABLE_DB_EXECUTION_BLOCKED: PostgreSQL 16 server/client binaries required; set CELEBIX_TEST_PG_BIN');
}

/** Starts a fresh private cluster listening only on its own Unix socket. */
export function startDisposablePostgres({database='current_signup_isolated'} = {}) {
  assert.match(database, /^[a-z][a-z0-9_]*$/);
  const bin = resolvePostgres16Bin();
  const directory = mkdtempSync(path.join(tmpdir(),'cspg-'));
  const data = path.join(directory,'data'), socket = path.join(directory,'s');
  mkdirSync(socket, {mode:0o700});
  const port = 24000 + Math.floor(Math.random()*10000);
  const env = {...cleanEnvironment(), LC_ALL:'C', LANG:'C', TZ:'UTC'};
  const run = (program, args, input='') => {
    const result = spawnSync(path.join(bin,program), args, {input, encoding:'utf8', timeout:120000, maxBuffer:64*1024*1024, env});
    if (result.status !== 0) throw new Error(`${program} failed: ${result.error?.message ?? result.stderr ?? result.signal}`);
    return result.stdout.trim();
  };
  const args = ['-h',socket,'-p',String(port),'-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1'];
  const sql = source => run('psql',args,source);
  let stopped = false;
  const interrupted = signal => {
    try {stop();}
    finally {process.exit(signal==='SIGTERM' ? 143 : 130);}
  };
  const terminate = () => interrupted('SIGTERM'), interrupt = () => interrupted('SIGINT');
  const stop = () => {
    if (stopped) return;
    if (existsSync(path.join(data,'postmaster.pid'))) run('pg_ctl',['-D',data,'-w','-t','20','-m','immediate','stop']);
    rmSync(directory,{recursive:true,force:true});
    stopped = true;
    process.removeListener('SIGTERM',terminate);
    process.removeListener('SIGINT',interrupt);
  };
  process.once('SIGTERM',terminate);
  process.once('SIGINT',interrupt);
  try {
    run('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);
    const quotedSocket = `'${socket.replaceAll("'", "'\\''")}'`;
    run('pg_ctl',['-D',data,'-w','-t','20','-o',`-k ${quotedSocket} -p ${port} -h ''`,'-l',path.join(directory,'postgres.log'),'start']);
    run('createdb',['-h',socket,'-p',String(port),'-U','postgres',database]);
    const authority = JSON.parse(sql("SELECT jsonb_build_object('data',current_setting('data_directory'),'major',current_setting('server_version_num')::int/10000,'address',inet_server_addr(),'listen',current_setting('listen_addresses'),'socket',current_setting('unix_socket_directories'),'database',current_database())"));
    assert.deepEqual(authority,{data,major:16,address:null,listen:'',socket,database},'disposable cluster authority mismatch');
    return {bin, directory, data, socket, port, database, sql, stop,
      poolOptions:{host:socket,port,user:'postgres',database,password:'unused-disposable-password',ssl:false,options:'-c statement_timeout=10000',application_name:'celebix-disposable-signup',max:2}};
  } catch (error) {
    const log = path.join(directory,'postgres.log');
    if (existsSync(log)) error.message += `\nDisposable PostgreSQL log:\n${readFileSync(log,'utf8').slice(-4000)}`;
    stop();
    throw error;
  }
}
