import { join } from 'node:path';
import type { CosmiconfigResult } from 'cosmiconfig';
import { Effect, Option, pipe } from 'effect';
import { isNonEmptyObject } from 'tightrope/guard/is-non-empty-object.js';
import type { O } from 'ts-toolbelt';
import type { RcConfig } from '../config/types.js';
import type { PackageJson } from '../get-package-json-files/package-json-file.js';
import type { Io } from './index.js';
import { readJsonFileSync } from './read-json-file-sync.js';

const getOptionOfNonEmptyObject = Option.liftPredicate(isNonEmptyObject<any>);

type UnverifiedRcConfig = O.Partial<RcConfig, 'deep'>;

export function readConfigFile(
  io: Io,
  configPath?: string,
): Effect.Effect<UnverifiedRcConfig> {
  return pipe(
    Effect.try(() => io.cosmiconfig.cosmiconfig('synopkg')),
    Effect.flatMap(client =>
      Effect.tryPromise(() =>
        configPath ? client.load(configPath) : client.search(),
      ),
    ),
    Effect.flatMap(result =>
      result !== null
        ? getValueFromCosmiconfig(result)
        : findConfigInPackageJson(io),
    ),
    Effect.tap(config =>
      Effect.logDebug(`config file found: ${JSON.stringify(config)}`),
    ),
    Effect.tapError(() =>
      Effect.logDebug('no config file found, will use defaults'),
    ),
    Effect.catchAll(() => Effect.succeed({})),
  );
}

/**
 * Look for a .config.synopkg property in the root package.json.
 * @see https://github.com/SynoPkg/synopkg/issues/86
 */
function findConfigInPackageJson(
  io: Io,
): Effect.Effect<UnverifiedRcConfig, unknown> {
  return pipe(
    Effect.Do,
    Effect.bind('rcPath', () =>
      Effect.succeed(join(io.process.cwd(), 'package.json')),
    ),
    Effect.bind('packageJson', ({ rcPath }) =>
      readJsonFileSync<PackageJson>(io, rcPath),
    ),
    Effect.bind('config', ({ packageJson }) =>
      Effect.try(() => packageJson.contents?.config?.synopkg),
    ),
    Effect.flatMap(({ config }) => getOptionOfNonEmptyObject(config)),
    Effect.tapBoth({
      onSuccess: () =>
        Effect.logDebug('config found in <package.json>.config.synopkg'),
      onFailure: () =>
        Effect.logDebug('config not found in <package.json>.config.synopkg'),
    }),
  );
}

/** Extract the value from a successful search by cosmiconfig */
function getValueFromCosmiconfig(
  result: Exclude<CosmiconfigResult, null>,
): Effect.Effect<UnverifiedRcConfig, unknown> {
  return pipe(
    Effect.succeed(result),
    Effect.tap(result =>
      Effect.logDebug(`cosmiconfig found ${result.filepath}`),
    ),
    Effect.flatMap(result => getOptionOfNonEmptyObject(result.config)),
  );
}
