import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { ComponentTestFixture } from './component-test-fixture.js';

/** Supplies minimal components while preserving the established Node test conventions. */
export class MinimalTestFixture extends ComponentTestFixture {
  /** Creates explicit configuration ownership and an inherited test profile with no discovery fields. */
  constructor(t: TestContext, packageRoot = '.') {
    super(t);
    this.environment();
    if (packageRoot !== '.') {
      mkdirSync(join(this.repo, packageRoot));
      renameSync(join(this.repo, 'tests'), join(this.repo, packageRoot, 'tests'));
    }
    this.definition('platform', 'platform', {
      role: 'engineer',
      executionProfile: 'luna',
      reads: ['.'],
    });
    this.definition('package', 'package', {
      parentId: 'platform',
      root: packageRoot,
      testProfile: 'node',
      classification: [{ path: 'tests/examples', kind: 'documentation' }],
    });
    this.definition('sample', 'library', { parentId: 'package', owns: ['tests'] });
    this.maintenance();
    this.commit();
  }

  /** Declares repository identity explicitly for the two package roots. */
  private environment(): void {
    this.git('remote', 'add', 'origin', 'https://example.invalid/sample.git');
    this.put('architecture/environment.yaml', {
      schemaVersion: 3,
      prerequisites: [],
      setup: [],
      generatedDirectories: ['.test-build'],
      workspace: {
        primary: { id: 'sample', repository: 'https://example.invalid/sample.git' },
        dependencies: [],
      },
    });
  }

  /** Keeps shared configuration owned without giving a container descendant write authority. */
  private maintenance(): void {
    this.definition('maintenance-package', 'package', { parentId: 'platform' });
    this.definition('maintenance', 'foundation', {
      parentId: 'maintenance-package',
      owns: [
        'architecture/environment.yaml',
        'architecture/roles',
        'architecture/execution-profiles',
        'architecture/test-profiles',
        'architecture/components/platform.yaml',
        'architecture/components/package.yaml',
        'architecture/components/maintenance-package.yaml',
        'build.cjs',
        '.gitignore',
      ],
    });
  }

  /** Writes one architectural declaration without legacy location or discovery duplication. */
  private definition(id: string, type: string, fields: object): void {
    this.put(`architecture/components/${id}.yaml`, {
      schemaVersion: 5,
      id,
      type,
      purpose: 'Own test selection',
      ...fields,
    });
  }
}
