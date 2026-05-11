import type { TaskRun } from '@arandano/core';

export interface BuildContainerSpecOpts {
  task: TaskRun;
  image: string;
  projectRoot: string;
  runFolder: string;
  hostEnv: Record<string, string | undefined>;
}

export interface ContainerSpec {
  Image: string;
  WorkingDir: string;
  User: string;
  Env: string[];
  HostConfig: { Binds: string[]; AutoRemove: boolean };
}

export function buildContainerSpec(opts: BuildContainerSpecOpts): ContainerSpec {
  const { task, image, projectRoot, runFolder, hostEnv } = opts;

  const env: string[] = [
    `ARANDANO_TASK_ID=${task.taskId}`,
    `ARANDANO_TASK_MD=${task.taskMdPath}`,
    `ARANDANO_ROLE_MD=${task.rolePath}`,
    `ARANDANO_CLI=${task.cli}`,
    `ARANDANO_MODEL=${task.model}`,
    `ARANDANO_TDD=${task.tdd}`,
    `ARANDANO_RUN_FOLDER=${runFolder}`,
    `ARANDANO_QUALITY_JSON=${JSON.stringify(task.quality)}`,
    `ARANDANO_CONTEXT_PATHS=${task.contextPaths.join(',')}`,
  ];

  for (const key of task.envPass) {
    const v = hostEnv[key];
    if (typeof v === 'string' && v.length > 0) env.push(`${key}=${v}`);
  }

  return {
    Image: image,
    WorkingDir: task.workdir,
    User: '1000:1000',
    Env: env,
    HostConfig: {
      Binds: [`${projectRoot}:${task.workdir}`],
      AutoRemove: false,
    },
  };
}
