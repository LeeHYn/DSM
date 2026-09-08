// Run with the Groovy runtime shipped in the project's Gradle distribution.
def source = new File(args ? args[0] : 'release-config.gradle')
assert source.isFile(): 'Release validator is not implemented'
def validate = new GroovyShell().evaluate(source)
def sandbox = java.nio.file.Files.createTempDirectory('dailyup-release-test-').toFile()
try {
    def store = new File(sandbox, 'fixture.jks')
    store.text = 'not a key: existence validation fixture only'
    def env = new File(sandbox, '.env.release.local')
    env.text = '''API_BASE_URL=https://api.example.invalid
GOOGLE_WEB_CLIENT_ID=fixture
PRIVACY_POLICY_URL=https://privacy.example.com/dailyup
ACCOUNT_DELETION_URL=https://privacy.example.com/dailyup#account-deletion
'''
    def props = [DAILYUP_UPLOAD_STORE_FILE: store.absolutePath,
                 DAILYUP_UPLOAD_STORE_PASSWORD: 'test-only-password',
                 DAILYUP_UPLOAD_KEY_ALIAS: 'test-only-alias',
                 DAILYUP_UPLOAD_KEY_PASSWORD: 'test-only-password']
    def values = [API_BASE_URL: 'https://api.example.invalid',
                  GOOGLE_WEB_CLIENT_ID: 'fixture',
                  PRIVACY_POLICY_URL: 'https://privacy.example.com/dailyup',
                  ACCOUNT_DELETION_URL: 'https://privacy.example.com/dailyup#account-deletion']
    def input = { -> [properties: props, envFile: env, env: values, tasks: [':app:bundleRelease'], override: false] }
    assert validate(input()).empty
    props.keySet().each { key ->
        def missing = new LinkedHashMap(props)
        missing.remove(key)
        assert validate(input() + [properties: missing]).any { it.contains(key) }
        missing[key] = '  '
        assert validate(input() + [properties: missing]).any { it.contains(key) }
    }
    ['relative.jks', sandbox.absolutePath, new File(sandbox, 'absent.jks').absolutePath].each { path ->
        assert !validate(input() + [properties: props + [DAILYUP_UPLOAD_STORE_FILE: path]]).empty
    }
    assert !validate(input() + [envFile: new File(sandbox, 'absent.env')]).empty
    assert !validate(input() + [override: true]).empty
    [['build'], ['assemble'], ['assembleDebug', 'bundleRelease'], ['signingReport', 'bundleRelease']].each { tasks ->
        assert !validate(input() + [tasks: tasks]).empty
    }
    assert validate(input() + [tasks: ['clean', ':app:assembleRelease']]).empty
    assert validate(input() + [tasks: [':app:validateReleaseConfiguration']]).empty
    ['', 'http://example.invalid', 'https://user:pass@example.invalid', 'https://example.invalid?',
     'https://example.invalid#', 'https:/invalid', 'not-a-url'].each { url ->
        assert validate(input() + [env: values + [API_BASE_URL: url]]).any { it.contains('API_BASE_URL') }
    }
    assert !validate(input() + [env: values + [GOOGLE_WEB_CLIENT_ID: ' ']]).empty
    assert validate(input() + [env: values + [API_BASE_URL: 'https://example.invalid:8443/api/']]).empty
    ['PRIVACY_POLICY_URL', 'ACCOUNT_DELETION_URL'].each { key ->
        def missing = new LinkedHashMap(values)
        missing.remove(key)
        assert validate(input() + [env: missing]).any { it.contains(key) }
        ['', '  ', 'http://privacy.example.com/dailyup',
         'https://user:private-value@privacy.example.com/dailyup',
         'https://privacy.example.invalid/dailyup', 'not-a-url'].each { url ->
            assert validate(input() + [env: values + [(key): url]]).any { it.contains(key) }
        }
    }
    assert validate(input() + [env: values + [ACCOUNT_DELETION_URL:
        'https://privacy.example.com/dailyup?source=play#account-deletion']]).empty
    def errors = validate(input() + [properties: props + [DAILYUP_UPLOAD_STORE_FILE: 'private/path']])
    assert !errors.join().contains('private/path')
    assert !errors.join().contains('test-only-password')
    errors = validate(input() + [env: values + [ACCOUNT_DELETION_URL:
        'https://user:private-value@privacy.example.com/dailyup']])
    assert !errors.join().contains('private-value')
    println 'Release input behavior checks PASS'
} finally {
    sandbox.listFiles().each { assert it.delete() }
    assert sandbox.delete()
}
