export const DEFAULT_GAME_TYPE = 'minecraft';
export const GAME_TYPE_ENV_KEY = 'GAMESERVER_TYPE';
export const GAME_IMAGE_ENV_KEY = 'GAMESERVER_IMAGE';
export const GAME_GPU_ENV_KEY = 'GAMESERVER_GPU';

export type GameServerRuntime = {
  image?: string;
  gpu?: 'nvidia';
};

export type ServerProfile = {
  id: string;
  gameType: string;
};

export type ServerDefinition = ServerProfile & {
  serverDirOnBot: string;
  serverDirOnDockerHost: string;
  envFilePathOnBot: string;
  environment: Record<string, string>;
  runtime?: GameServerRuntime;
};

export type GameServerStatus =
  | { status: 'not_found' }
  | { status: 'running' | 'exited' | 'unknown'; serverId: string | null; gameType: string | null };

export type GameServerConnectionInfo = {
  hostPort: string;
  host?: string;
  ddns?: string;
  ip?: string;
};

export type GameServerDriverContext = {
  containerName: string;
  networkName: string;
};
