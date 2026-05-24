import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DockerClient } from './client.js';
import type { ContainerSpec } from './containerSpec.js';

export type CloneProjectFn = (src: string, dst: string, remoteUrl: string) => Promise<void>;

export interface PoolAcquireOpts {
  image: string;
  projectRoot: string;
  remoteUrl?: string;
  buildSpec: (workdir: string) => ContainerSpec;
}

export interface PoolAcquireResult {
  slotId: string;
  containerId: string;
  container: Awaited<ReturnType<DockerClient['createContainer']>>;
  workdir: string;
  isWarm: boolean;
}

interface Slot {
  id: string;
  image: string;
  workdir: string;
  container: PoolAcquireResult['container'];
  inUse: boolean;
  transient: boolean; // true when pool is full at acquire-time; destroyed on release
}

export interface WarmContainerPoolOpts {
  client: DockerClient;
  cloneProject: CloneProjectFn;
  poolDir?: string;
  maxSlots: number;
}

const imageHash = (image: string): string =>
  createHash('sha1').update(image).digest('hex').slice(0, 12);

export class WarmContainerPool {
  private readonly slots = new Map<string, Slot>();
  private slotCounter = 0;
  private readonly opts: Required<Omit<WarmContainerPoolOpts, 'poolDir'>> & { poolDir: string };

  constructor(opts: WarmContainerPoolOpts) {
    this.opts = {
      client: opts.client,
      cloneProject: opts.cloneProject,
      maxSlots: opts.maxSlots,
      poolDir: opts.poolDir ?? join(tmpdir(), 'arandano-pool'),
    };
  }

  async acquire(opts: PoolAcquireOpts): Promise<PoolAcquireResult> {
    // 1. Try to find a warm idle slot for the same image.
    for (const slot of this.slots.values()) {
      if (!slot.inUse && slot.image === opts.image) {
        slot.inUse = true;
        return {
          slotId: slot.id,
          containerId: slot.container.id,
          container: slot.container,
          workdir: slot.workdir,
          isWarm: true,
        };
      }
    }
    // 2. No warm slot; check if we have capacity to create a new persistent slot.
    const sameImageCount = [...this.slots.values()].filter(
      (s) => s.image === opts.image && !s.transient,
    ).length;
    const transient = sameImageCount >= this.opts.maxSlots;

    this.slotCounter++;
    const slotIdx = this.slotCounter;
    const slotId = `slot-${imageHash(opts.image)}-${slotIdx}`;
    const workdir = join(this.opts.poolDir, imageHash(opts.image), `slot-${slotIdx}`);
    await mkdir(workdir, { recursive: true });
    await this.opts.cloneProject(opts.projectRoot, workdir, opts.remoteUrl ?? '');

    const spec = opts.buildSpec(workdir);
    await this.opts.client.pull(opts.image);
    const container = await this.opts.client.createContainer(spec as unknown);
    await container.start();

    const slot: Slot = {
      id: slotId,
      image: opts.image,
      workdir,
      container,
      inUse: true,
      transient,
    };
    this.slots.set(slotId, slot);

    return {
      slotId,
      containerId: container.id,
      container,
      workdir,
      isWarm: false,
    };
  }

  async release(args: { slotId: string; resetOk: boolean }): Promise<void> {
    const slot = this.slots.get(args.slotId);
    if (!slot) return;
    if (slot.transient || !args.resetOk) {
      // Destroy.
      await slot.container.stop({ t: 5 }).catch(() => {});
      await slot.container.remove({ force: true }).catch(() => {});
      await rm(slot.workdir, { recursive: true, force: true }).catch(() => {});
      this.slots.delete(args.slotId);
      return;
    }
    slot.inUse = false;
  }

  async shutdown(): Promise<void> {
    for (const slot of this.slots.values()) {
      await slot.container.stop({ t: 5 }).catch(() => {});
      await slot.container.remove({ force: true }).catch(() => {});
      await rm(slot.workdir, { recursive: true, force: true }).catch(() => {});
    }
    this.slots.clear();
  }
}
