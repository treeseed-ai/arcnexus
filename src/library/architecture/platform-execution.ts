import type { Catalog, Component } from './components.js';
import { ancestry, scopePath } from './component-paths.js';
import { InputError } from './config.js';
import { git } from '../operations/process.js';

/** Resolves v5 execution authority from its single platform declaration. */
export class PlatformExecution {
  /** Keeps profile and component lookups pinned to the captured catalog. */
  constructor(private readonly catalog: Catalog) {}

  /** Requires unambiguous platform authority and rejects the retired duplicate defaults file. */
  defaults(source: string, base: string) {
    const platforms = Object.values(this.catalog.components).filter((c) => c.type === 'platform');
    if (platforms.length !== 1 || platforms[0]!.schemaVersion !== 5)
      throw new InputError('Version-five execution requires one authoritative platform');
    const retired = git(
      source,
      'ls-tree',
      '-r',
      '--name-only',
      base,
      '--',
      'architecture/execution.json',
      'architecture/execution.yaml',
      'architecture/execution.yml',
    );
    if (retired.trim())
      throw new InputError(
        'Retired execution configuration: move settings to the platform and remove architecture/execution',
      );
    const platform = platforms[0]!;
    this.director(platform);
    return {
      directorProfile: platform.director!.profile,
      reviewerProfile: platform.reviewerProfile!,
      defaultPackage: platform.defaultPackage,
      verificationInputs: (platform.verificationInputs ?? []).map(scopePath),
    };
  }

  /** Validates the declared director without falling back to a hidden component or model. */
  director(platform: Component): Component {
    if (!platform.director || !platform.reviewerProfile)
      throw new InputError('Platform must declare director and reviewerProfile for execution');
    const director = this.catalog.components[platform.director.component];
    if (
      !director ||
      ['platform', 'package'].includes(director.type) ||
      !ancestry(this.catalog, director.id).some((c) => c.id === platform.id)
    )
      throw new InputError('Director must be an executable component in the declaring platform');
    if (!this.catalog.roles[director.role]?.activities.includes('research'))
      throw new InputError('Director role must permit research');
    for (const id of [platform.director.profile, platform.reviewerProfile])
      if (!this.catalog.profiles[id]) throw new InputError(`Unknown execution profile: ${id}`);
    return director;
  }
}
