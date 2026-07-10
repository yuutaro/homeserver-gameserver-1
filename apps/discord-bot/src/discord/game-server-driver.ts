import type Docker from 'dockerode';
import type {
  GameServerConnectionInfo,
  GameServerDriverContext,
  ServerDefinition,
} from './game-server.types.js';

export interface GameServerDriver {
  readonly gameType: string;

  validate(server: ServerDefinition): void;
  getImage(): string;
  createContainerOptions(
    server: ServerDefinition,
    context: GameServerDriverContext,
  ): Docker.ContainerCreateOptions;
  getConnectionInfo(server: ServerDefinition): GameServerConnectionInfo;
  save(server: ServerDefinition, context: GameServerDriverContext): Promise<void>;
  stopGracefully(server: ServerDefinition, context: GameServerDriverContext): Promise<void>;
  listUsers(server: ServerDefinition, context: GameServerDriverContext): Promise<string>;
  sendCommand(server: ServerDefinition, context: GameServerDriverContext, command: string): Promise<string>;
  announce(server: ServerDefinition, context: GameServerDriverContext, message: string): Promise<void>;
}
