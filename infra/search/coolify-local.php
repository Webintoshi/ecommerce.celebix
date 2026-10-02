<?php
// Called only through a captured local stdin/stdout pipe. Never echo this request or model values.
ini_set('display_errors', '0');

class SearchSetupError extends RuntimeException {
    public function __construct(string $code, public array $diagnostic = []) { parent::__construct($code); }
}

const SEARCH_APPS = ['vtc2aah63jbqnmtxmvykn6jl', 'h55zoba9jh6ij8g6irpqzd9i'];
const SEARCH_KEYS = ['CELEBIX_SEARCH_URL', 'CELEBIX_SEARCH_API_KEY', 'CELEBIX_SEARCH_WRITE_API_KEY', 'CELEBIX_SEARCH_INDEX', 'CELEBIX_SEARCH_WORKER_ENABLED'];
const TERMINAL_DEPLOYMENTS = ['finished', 'failed', 'cancelled', 'canceled', 'cancelled-by-user'];

function refuse(string $code): never { throw new SearchSetupError($code); }

function validateInput(array $input): array {
    $method = $input['method'] ?? null;
    $route = $input['route'] ?? '';
    if (!is_string($route) || !preg_match('~^/applications/([a-z0-9]+)(/envs(?:/bulk)?)?$~D', $route, $matched)
        || !in_array($matched[1], SEARCH_APPS, true) || !in_array($method, ['GET', 'PATCH'], true)) {
        refuse('local_cli_request_refused');
    }
    $suffix = $matched[2] ?? '';
    if (($method === 'GET' && $suffix === '/envs/bulk') || ($method === 'PATCH' && $suffix !== '/envs/bulk')) {
        refuse('local_cli_request_refused');
    }
    if ($method === 'GET') {
        if (($input['body'] ?? null) !== null) refuse('local_cli_request_refused');
        return [$method, $matched[1], $suffix, []];
    }
    if (($input['writeAllowed'] ?? false) !== true) refuse('local_cli_write_not_allowed');
    $body = $input['body'] ?? null;
    if (!is_array($body) || array_keys($body) !== ['data'] || !is_array($body['data']) || !array_is_list($body['data'])
        || count($body['data']) < 1 || count($body['data']) > count(SEARCH_KEYS)) refuse('local_cli_request_refused');
    $seen = [];
    $flags = ['is_literal' => true, 'is_buildtime' => false, 'is_runtime' => true, 'is_multiline' => false, 'is_preview' => false];
    foreach ($body['data'] as $entry) {
        if (!is_array($entry) || count($entry) !== 7 || array_diff(array_keys($entry), ['key', 'value', ...array_keys($flags)])
            || !in_array($entry['key'] ?? null, SEARCH_KEYS, true) || !is_string($entry['value'] ?? null)
            || isset($seen[$entry['key']])) refuse('local_cli_request_refused');
        foreach ($flags as $key => $value) if (($entry[$key] ?? null) !== $value) refuse('local_cli_request_refused');
        $seen[$entry['key']] = true;
        $key = $entry['key']; $value = $entry['value'];
        if (($key === 'CELEBIX_SEARCH_URL' && $value !== 'http://celebix-catalog-search:7700')
            || ($key === 'CELEBIX_SEARCH_INDEX' && $value !== 'celebix_products_v1')
            || ($key === 'CELEBIX_SEARCH_WORKER_ENABLED' && !in_array($value, ['true', 'false'], true))) refuse('local_cli_request_refused');
        if (in_array($key, ['CELEBIX_SEARCH_API_KEY', 'CELEBIX_SEARCH_WRITE_API_KEY'], true)
            && !($key === 'CELEBIX_SEARCH_WRITE_API_KEY' && $value === '')
            && !preg_match('/^[A-Za-z0-9_-]{16,256}$/D', $value)) refuse('local_cli_request_refused');
    }
    return [$method, $matched[1], $suffix, $body['data']];
}

function guardedApps(bool $lock): array {
    if (App\Models\ApplicationDeploymentQueue::query()->whereNotIn('status', TERMINAL_DEPLOYMENTS)->exists()) {
        refuse('global_deployment_queue_busy');
    }
    $apps = [];
    foreach (SEARCH_APPS as $id) {
        $query = App\Models\Application::query()->where('uuid', $id);
        $app = ($lock ? $query->lockForUpdate() : $query)->first();
        if (!$app || !str_contains((string) $app->build_command, 'storefront-shared')
            || !str_contains((string) $app->start_command, '@celebix/storefront-shared')) refuse('wrong_shared_application');
        $settingsQuery = $app->settings();
        $settings = ($lock ? $settingsQuery->lockForUpdate() : $settingsQuery)->first();
        if (!$settings || $settings->is_auto_deploy_enabled !== false || $settings->is_preview_deployments_enabled !== false) {
            refuse('shared_application_auto_deploy_enabled');
        }
        $app->setRelation('settings', $settings);
        $apps[$id] = $app;
    }
    return $apps;
}

function envQuery($app) {
    return App\Models\EnvironmentVariable::query()->where('resourceable_type', App\Models\Application::class)->where('resourceable_id', $app->id);
}

function selectedEnvironment($app): array {
    // Only the five owned fields are decrypted. Values stay inside the captured local pipe.
    return envQuery($app)->where('is_preview', false)->whereIn('key', SEARCH_KEYS)->orderBy('id')->get()->map(fn($row) => [
        'key' => (string) $row->key, 'value' => (string) $row->value, 'is_literal' => (bool) $row->is_literal,
        'is_buildtime' => (bool) $row->is_buildtime, 'is_runtime' => (bool) $row->is_runtime,
        'is_multiline' => (bool) $row->is_multiline, 'is_preview' => (bool) $row->is_preview,
    ])->all();
}

function unrelatedState($app): array {
    $otherRows = envQuery($app)->orderBy('id')->get()->filter(fn($row) => $row->is_preview || !in_array($row->key, SEARCH_KEYS, true))
        ->map(fn($row) => $row->getRawOriginal())->values()->all();
    // Application has eager relation-count attributes which refresh() drops. Compare
    // persisted columns directly so those computed fields cannot cause false failures.
    $applicationRow = Illuminate\Support\Facades\DB::table($app->getTable())->where('id', $app->id)->first();
    $settingsRow = Illuminate\Support\Facades\DB::table($app->settings->getTable())->where('id', $app->settings->id)->first();
    return ['application' => (array) $applicationRow, 'settings' => (array) $settingsRow, 'environment' => $otherRows];
}

try {
    $raw = file_get_contents('php://stdin', false, null, 0, 65537);
    if (strlen($raw) > 65536) refuse('local_cli_request_refused');
    $input = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($input)) refuse('local_cli_request_refused');
    [$method, $id, $suffix, $entries] = validateInput($input);
    require '/var/www/html/vendor/autoload.php';
    $application = require '/var/www/html/bootstrap/app.php';
    $application->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

    if ($method === 'GET') {
        $app = guardedApps(false)[$id];
        $data = $suffix === '/envs' ? selectedEnvironment($app) : [
            'uuid' => (string) $app->uuid, 'build_command' => (string) $app->build_command,
            'start_command' => (string) $app->start_command,
            'is_auto_deploy_enabled' => (bool) $app->settings->is_auto_deploy_enabled,
            'is_preview_deployments_enabled' => (bool) $app->settings->is_preview_deployments_enabled,
            'globalIdle' => true,
        ];
    } else {
        $data = Illuminate\Support\Facades\DB::transaction(function () use ($id, $entries) {
            $app = guardedApps(true)[$id];
            $before = unrelatedState($app);
            // Creation observers normally synthesize preview rows. Keep existing previews intact.
            App\Models\EnvironmentVariable::withoutEvents(function () use ($app, $entries) {
                foreach ($entries as $entry) {
                    $scope = ['resourceable_type' => App\Models\Application::class, 'resourceable_id' => $app->id,
                        'key' => $entry['key'], 'is_preview' => false];
                    $attributes = $entry;
                    unset($attributes['key']);
                    $attributes['version'] = config('constants.coolify.version');
                    $row = App\Models\EnvironmentVariable::firstOrNew($scope);
                    $row->fill($attributes);
                    // withoutEvents also suppresses BaseModel's creating UUID hook.
                    // Preserve existing identities and explicitly run its normal factory for new rows.
                    if (!$row->exists) $row->uuid = new_public_id();
                    $row->save();
                }
            });
            $app->refresh(); $app->load('settings');
            $after = unrelatedState($app);
            if ($before !== $after) {
                $changed = [];
                foreach (['application', 'settings', 'environment'] as $section) {
                    if ($before[$section] !== $after[$section]) {
                        $changed[$section] = array_keys(array_filter($before[$section],
                            fn($value, $key) => !array_key_exists($key, $after[$section]) || $value !== $after[$section][$key], ARRAY_FILTER_USE_BOTH));
                    }
                }
                throw new SearchSetupError('other_environment_changed', ['changedFields' => $changed]);
            }
            $saved = collect(selectedEnvironment($app))->keyBy('key');
            foreach ($entries as $entry) {
                $observed = $saved->get($entry['key']);
                foreach ($entry as $key => $value) if (!$observed || ($observed[$key] ?? null) !== $value) refuse('environment_verification_failed');
            }
            return ['updated' => count($entries), 'otherEnvironmentUnchanged' => true];
        });
    }
    echo json_encode(['ok' => true, 'data' => $data], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    // Model/query exception text and request values may be secret-bearing.
    $diagnostic = ['class' => get_class($error), 'file' => basename($error->getFile()), 'line' => $error->getLine()];
    if ($error instanceof SearchSetupError) $diagnostic += $error->diagnostic;
    if ($error instanceof Illuminate\Database\QueryException) {
        $diagnostic['sqlstate'] = $error->errorInfo[0] ?? null;
        foreach (['column', 'relation', 'constraint'] as $identifier) {
            if (preg_match('/' . $identifier . ' "([a-zA-Z_][a-zA-Z0-9_]{0,127})"/', $error->errorInfo[2] ?? '', $matched)) {
                $diagnostic[$identifier] = $matched[1];
            }
        }
    }
    echo json_encode(['ok' => false, 'code' => $error instanceof SearchSetupError ? $error->getMessage() : 'local_cli_failed',
        'diagnostic' => $diagnostic]);
}
