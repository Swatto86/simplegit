export type OperationProps = {
  repoPath: string;
  localRepository: {
    path: string;
    name: string;
  } | null;
  onMessage: (message: string) => void;
  onRepositoryCloned: (repo: { path: string; name: string }) => void;
};
