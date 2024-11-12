import { RepositoryStats } from "./repositoryStats";

export interface Repository {
  name: string;
  path: string;
  stats: RepositoryStats;
  isPinned?: boolean;
}

export interface LocalRepository {
  name: string;
  path: string;
  stats: RepositoryStats;
  isLocal: true;
}
