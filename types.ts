export interface UrlEntry {
  url: string;
  highlight?: string;
  textFragmentUrl?: string; // URL with text fragment for highlighting
}

export interface FolderNode {
  id: string;
  title: string;
  urls: UrlEntry[];
  children: FolderNode[];
}
