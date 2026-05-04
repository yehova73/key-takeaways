export interface FolderNode {
  id: string;
  title: string;
  urls: Array<{ url: string; highlight?: string }>;
  children: FolderNode[];
}
