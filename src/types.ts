export interface User {
  id: string;
  fullName: string;
  username?: string;
  email: string;
  phoneNumber?: string;
  address?: string;
  profilePhoto?: string;
  coverPhoto?: string;
  bio?: string;
  birthday?: string;
  coinBalance: number;
  isVerified: boolean;
  isOnline?: boolean;
  isProMode?: boolean;
  lastActive?: any;
  privacy?: {
    email: 'public' | 'private';
    phoneNumber: 'public' | 'private';
    address: 'public' | 'private';
    birthday: 'public' | 'private';
    followersList?: 'public' | 'private';
    followingList?: 'public' | 'private';
    likesList?: 'public' | 'private';
  };
  profilePhotosHistory?: string[];
  coverPhotosHistory?: string[];
  createdAt: string;
}

export interface Video {
  id: string;
  userId: string;
  fullName: string;
  username?: string;
  profilePhoto?: string;
  title: string;
  description: string;
  contentUrl: string;
  type: 'video' | 'image' | 'text';
  thumbnailUrl?: string;
  isPublic: boolean;
  canDownload: boolean;
  views: number;
  likeCount: number;
  commentCount: number;
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  overlayText?: string;
  textColor?: string;
  backgroundColor?: string;
  musicId?: string;
  musicName?: string;
  musicVolume?: number;
  speed?: number;
  stickers?: { value: string, x: number, y: number, scale: number }[];
  trimStart?: number;
  trimEnd?: number;
  servers?: { name: string; url: string }[];
  currentServerIndex?: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'like' | 'comment' | 'follow' | 'share';
  fromUserId: string;
  videoId?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PendingUpload {
  id: string;
  type?: 'video' | 'photo' | 'text';
  preview?: string;
  progress: number;
  isStory: boolean;
  status: 'queued' | 'uploading' | 'finishing' | 'error' | 'failed' | 'paused' | 'completed';
  isPreUpload?: boolean;
  error?: string;
  title?: string;
  description?: string;
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  overlayText?: string;
  textColor?: string;
  backgroundColor?: string;
  musicId?: string;
  musicName?: string;
  musicVolume?: number;
  speed?: number;
  stickers?: { value: string, x: number, y: number, scale: number }[];
  trimStart?: number;
  trimEnd?: number;
  fullName?: string;
  profilePhoto?: string;
  userId?: string;
  uploadMode?: 'video' | 'photo' | 'text';
  previewUrl?: string | null;
  textContent?: string;
  bgColor?: string;
  quality?: 'high' | 'medium' | 'low';
}

export interface Story {
  id: string;
  userId: string;
  fullName: string;
  profilePhoto?: string;
  type: 'video' | 'image' | 'text';
  url?: string;
  content?: string;
  backgroundColor?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  overlayText?: string;
  textColor?: string;
  speed?: number;
  stickers?: { value: string, x: number, y: number, scale: number }[];
  trimStart?: number;
  trimEnd?: number;
  servers?: { name: string; url: string }[];
  currentServerIndex?: number;
  viewers: string[];
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  receiverId: string;
  receiverName: string;
  receiverPhoto?: string;
  text: string;
  participants: string[];
  createdAt: any;
}

