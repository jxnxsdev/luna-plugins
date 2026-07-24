export type messageDataType = {
  title: string;
  artist: string;
  album: string;
  coverURL: string;
  playing: boolean;
  progress: number;
  duration: number;
  primaryColor?: string;
  secondaryColor?: string;
  nextMediaItem?: {
    title: string;
    artist: string;
    coverURL: string;
  };
};
