# M2M Bearer Guard

For service-to-service auth with no OAuth flow: extract the token via `bearer.replace('Bearer ', '')`, compare against a config value with `config.getOrThrow<string>(...)`, register the guard as `APP_GUARD`.
