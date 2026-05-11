import { join } from 'node:path/posix';

export interface RunFolderOpts {
  taskId: string;
  date: Date;
}

export function runFolder({ taskId, date }: RunFolderOpts): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const HH = String(date.getUTCHours()).padStart(2, '0');
  const MM = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${HH}-${MM}Z-${taskId}`;
}

export interface RunArtifactsOpts {
  projectRoot: string;
  folder: string;
}

export interface RunArtifacts {
  dir: string;
  journal: string;
  result: string;
  review: string;
}

export function runArtifacts({ projectRoot, folder }: RunArtifactsOpts): RunArtifacts {
  const dir = join(projectRoot, '.arandano', 'runs', folder);
  return {
    dir,
    journal: join(dir, 'journal.md'),
    result: join(dir, 'result.json'),
    review: join(dir, 'review.md'),
  };
}
