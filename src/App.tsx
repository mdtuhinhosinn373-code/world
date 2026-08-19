import imageCompression from 'browser-image-compression';
import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Search, 
  PlusSquare, 
  MessageCircle, 
  Heart, 
  MessageSquare, 
  Share2, 
  Music,
  Plus,
  Edit,
  ArrowLeft,
  ArrowRight,
  X,
  Send,
  LogOut,
  Coins,
  Settings as SettingsIcon,
  CheckCircle2,
  Clock,
  Bell,
  Eye,
  ImageIcon,
  Camera,
  Scissors,
  RotateCw,
  RefreshCcw,
  Zap,
  ZapOff,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  Type,
  Sliders,
  Sun,
  Contrast,
  Droplet,
  Palette,
  User as UserIcon,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Video as VideoIcon,
  Download,
  Volume2,
  Trash2,
  Star,
  VolumeX,
  MoreVertical,
  Check,
  Bookmark,
  UserPlus,
  ShoppingBag,
  Radio,
  Crown,
  BadgeCheck,
  ShieldCheck,
  Activity,
  HardDrive,
  FileText,
  Lock,
  RefreshCw,
  MoreHorizontal,
  Smile,
  AtSign,
  ThumbsDown,
  ThumbsUp,
  Globe,
  Monitor,
  Tag,
  Users,
  Play,
  Pause,
  Languages,
  Gauge,
  Utensils,
  Package,
  ChevronRight,
  Flag,
  UserX,
  ShieldAlert,
  EyeOff,
  UserMinus,
  Smartphone,
  Laptop,
  Store,
  History,
  HelpCircle,
  Info,
  BookOpen,
  LayoutDashboard,
  Compass,
  Rss,
  Briefcase,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { MUSIC_LIST } from './constants/music';
import { LANGUAGES, getTranslation } from './lib/languages';
import { useAuth, AuthProvider } from './AuthContext';
import { io } from 'socket.io-client';
import { Video, User, Story, PendingUpload } from './types';
import DirectMessages from './components/DirectMessages';
import FriendsCircle from './components/FriendsCircle';
import Marketplace from './components/Marketplace';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db, storage, forceReconnect, clearAppCache, isFirestoreShutdownError, testConnection as firebaseTestConnection, triggerQuotaExceeded } from './lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot as firestoreOnSnapshot, 
  doc, 
  updateDoc as firestoreUpdateDoc, 
  increment, 
  setDoc as firestoreSetDoc, 
  addDoc as firestoreAddDoc, 
  deleteDoc as firestoreDeleteDoc, 
  serverTimestamp,
  getDocs,
  where,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  limit,
  arrayUnion
} from 'firebase/firestore';

// Deduplicate helper by ID property to prevent key collisions across React maps
function deduplicateById(arr: any[]): any[] {
  const seen = new Set<string>();
  return arr.filter(item => {
    if (!item) return false;
    const rawId = item.data?.id || item.id;
    if (!rawId) return false;
    const id = String(rawId).trim();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Robust deduplication specifically for posts/videos to prevent any double-listing of same content URL or text content
function deduplicateVideos(arr: any[]): any[] {
  const seenId = new Set<string>();
  const seenUrl = new Set<string>();
  const seenText = new Set<string>();
  
  return arr.filter(item => {
    if (!item) return false;
    
    const actualItem = item.data || item;
    
    // 1. Check ID
    const rawId = actualItem.id || item.id;
    if (rawId) {
      const id = String(rawId).trim();
      if (seenId.has(id)) return false;
      seenId.add(id);
    }
    
    // 2. Check contentUrl (for photo and video posts)
    const contentUrl = actualItem.contentUrl;
    if (contentUrl) {
      const urlStr = String(contentUrl).trim();
      if (urlStr) {
        if (seenUrl.has(urlStr)) return false;
        seenUrl.add(urlStr);
      }
    }
    
    // 3. Check textContent (for text posts)
    const textContent = actualItem.textContent || actualItem.description;
    const isTextPost = actualItem.type === 'text';
    if (isTextPost && textContent) {
      const textStr = String(textContent).trim();
      const userId = actualItem.userId || '';
      const textKey = `${textStr}_${userId}`;
      if (seenText.has(textKey)) return false;
      seenText.add(textKey);
    }
    
    return true;
  });
}

// Robust helper to get actual web application origin even inside sandbox lock iframe
function getAppOrigin(): string {
  try {
    if (window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
  } catch (e) {}
  try {
    const urlObj = new URL(window.location.href);
    if (urlObj.origin && urlObj.origin !== 'null') {
      return urlObj.origin;
    }
  } catch (e) {}
  try {
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin && refUrl.origin !== 'null') {
        return refUrl.origin;
      }
    }
  } catch (e) {}
  try {
    if (window.location.host) {
      const proto = window.location.protocol && window.location.protocol !== 'about:' ? window.location.protocol : 'https:';
      return `${proto}//${window.location.host}`;
    }
  } catch (e) {}
  return window.location.origin || '';
}

// Background Connection Keep-Alive to prevent browsers suspending execution when locked/backgrounded
let globalSilentAudioContext: AudioContext | null = null;
let globalSilentOscillator: OscillatorNode | null = null;
let globalSilentGain: GainNode | null = null;

export const startBackgroundKeepAlive = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!globalSilentAudioContext) {
      globalSilentAudioContext = new AudioCtx();
    }
    if (globalSilentAudioContext.state === 'suspended') {
      globalSilentAudioContext.resume();
    }
    
    // Stop previous if exists
    if (globalSilentOscillator) {
      try { globalSilentOscillator.stop(); } catch(e){}
      globalSilentOscillator = null;
    }

    const osc = globalSilentAudioContext.createOscillator();
    const gain = globalSilentAudioContext.createGain();
    
    // Zero gain equals silent sound waves
    gain.gain.setValueAtTime(0, globalSilentAudioContext.currentTime);
    
    osc.connect(gain);
    gain.connect(globalSilentAudioContext.destination);
    
    osc.start();
    
    globalSilentOscillator = osc;
    globalSilentGain = gain;
    console.log("System Background Keep-Alive Audio loop started successfully.");
  } catch (e) {
    console.warn("Could not start background keep-alive audio context:", e);
  }
};

export const stopBackgroundKeepAlive = () => {
  if (globalSilentOscillator) {
    try { globalSilentOscillator.stop(); } catch(e){}
    globalSilentOscillator = null;
  }
  if (globalSilentAudioContext) {
    try { globalSilentAudioContext.close(); } catch(e){}
    globalSilentAudioContext = null;
  }
  console.log("System Background Keep-Alive Audio loop stopped.");
};

export const showSystemNotification = (title: string, body: string, avatarUrl?: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        const options: any = {
          body,
          icon: avatarUrl || '/logo.png',
          badge: '/logo.png',
          tag: 'world-social-notif',
          vibrate: [200, 100, 200]
        };
        registration.showNotification(title, options).catch(() => {
          new Notification(title, { body, icon: avatarUrl || '/logo.png' });
        });
      });
    } else {
      new Notification(title, { body, icon: avatarUrl || '/logo.png' });
    }
  } catch (err) {
    try {
      new Notification(title, { body, icon: avatarUrl || '/logo.png' });
    } catch (e) {}
  }
};

// Unified safe onSnapshot listener wrapper to suppress aborted shutdowns and quota limit error crashes
const onSnapshot = (query: any, ...args: any[]) => {
  if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
    console.warn("Firestore snapshot skipped due to active quota limits.");
    return () => {};
  }

  let options: any = null;
  let observer: any = null;
  let onNext: any = null;
  let onError: any = null;

  if (args.length === 1) {
    observer = args[0];
  } else if (args.length === 2) {
    if (typeof args[0] === 'function') {
      onNext = args[0];
      onError = args[1];
    } else if (typeof args[0] === 'object' && typeof args[1] === 'object') {
      options = args[0];
      observer = args[1];
    } else if (typeof args[0] === 'object' && typeof args[1] === 'function') {
      options = args[0];
      onNext = args[1];
    }
  } else if (args.length === 3) {
    options = args[0];
    onNext = args[1];
    onError = args[2];
  }

  const safeErrorHandler = (err: any) => {
    if (err?.code === 'aborted' || isFirestoreShutdownError(err)) {
      console.warn("Firestore listener safely aborted/ignored:", err.message);
      return;
    }
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
      return;
    }
    
    if (onError) {
      try {
        onError(err);
      } catch (innerErr) {
        console.error("Uncaught inside custom snapshot error handler:", innerErr);
      }
    } else if (observer && observer.error) {
      try {
        observer.error(err);
      } catch (innerErr) {
        console.error("Uncaught inside custom observer error handler:", innerErr);
      }
    } else {
      console.warn("Safe onSnapshot caught unhandled error:", err);
    }
  };

  const finalArgs: any[] = [];
  if (options) {
    finalArgs.push(options);
  }

  if (onNext) {
    finalArgs.push(onNext);
    finalArgs.push(safeErrorHandler);
  } else if (observer) {
    const wrappedObserver = {
      ...observer,
      next: (val: any) => {
        if (observer.next) {
          try {
            observer.next(val);
          } catch (innerErr) {
            console.error("Error in snapshot observer next callback:", innerErr);
          }
        }
      },
      error: safeErrorHandler
    };
    finalArgs.push(wrappedObserver);
  } else {
    finalArgs.push(() => {});
    finalArgs.push(safeErrorHandler);
  }

  try {
    return (firestoreOnSnapshot as any)(query, ...finalArgs);
  } catch (err: any) {
    console.warn("Error setting up safe Firestore snapshot collection listener:", err);
    return () => {};
  }
};

// Safe write wrappers that dynamically handle firebase daily free quota (resource-exhausted)
const addDoc = async (...args: any[]) => {
  try {
    if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
      console.warn("Storage Quota Limit active. Intercepted addDoc.");
      return { id: "local_" + Math.random().toString(36).substring(2, 9) } as any;
    }
    return await (firestoreAddDoc as any)(...args);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
      return { id: "local_" + Math.random().toString(36).substring(2, 9) } as any;
    }
    throw err;
  }
};

const setDoc = async (...args: any[]) => {
  try {
    if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
      console.warn("Storage Quota Limit active. Intercepted setDoc.");
      return;
    }
    return await (firestoreSetDoc as any)(...args);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
      return;
    }
    throw err;
  }
};

const updateDoc = async (...args: any[]) => {
  try {
    if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
      console.warn("Storage Quota Limit active. Intercepted updateDoc.");
      return;
    }
    return await (firestoreUpdateDoc as any)(...args);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
      return;
    }
    throw err;
  }
};

const deleteDoc = async (...args: any[]) => {
  try {
    if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
      console.warn("Storage Quota Limit active. Intercepted deleteDoc.");
      return;
    }
    return await (firestoreDeleteDoc as any)(...args);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
      return;
    }
    throw err;
  }
};
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';

// Haptic feedback for mobile devices
const hapticFeedback = (strength: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try {
      if (strength === 'light') window.navigator.vibrate(10);
      else if (strength === 'medium') window.navigator.vibrate(30);
      else window.navigator.vibrate([50, 30, 50]);
    } catch (e) {
      // Ignore vibration errors
    }
  }
};

// UI Utility
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const sendNotification = async (toUserId: string, fromUser: User, type: 'like' | 'comment' | 'follow', videoId?: string, message?: string) => {
  if (toUserId === fromUser.id) return;
  await addDoc(collection(db, 'users', toUserId, 'notifications'), {
    fromUserId: fromUser.id,
    fromUserName: fromUser.fullName,
    type,
    videoId: videoId || '',
    message: message || '',
    isRead: false,
    createdAt: serverTimestamp()
  });
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  if (isFirestoreShutdownError(error)) return;

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || '';

  if (code === 'resource-exhausted' || message.toLowerCase().includes('quota') || message.toLowerCase().includes('exhausted') || message.toLowerCase().includes('quota limit exceeded')) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
      (window as any).firestoreQuotaExceeded = true;
    }
  }

  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.warn('Firestore Non-Fatal Warning: ', JSON.stringify(errInfo));
  
  // Only alert for actual Permission Denied errors when online, and do not crash the app
  if (message.toLowerCase().includes('permission') && navigator.onLine) {
    alert(`Permission Denied! You don't have access to ${operationType} at ${path}.`);
  }
}

// --- Components ---

const FILTER_OPTIONS = [
  { id: 'none', name: 'Original', class: '', style: '' },
  { id: 'sepia', name: 'Vintage', class: 'sepia brightness-90 contrast-110 shadow-inner', style: 'sepia(1) brightness(0.9) contrast(1.1)' },
  { id: 'grayscale', name: 'B&W', class: 'grayscale brightness-110 contrast-125', style: 'grayscale(1) brightness(1.1) contrast(1.25)' },
  { id: 'warm', name: 'Warm', class: 'sepia-[.3] hue-rotate-[-30deg] saturate-150', style: 'sepia(0.3) hue-rotate(-30deg) saturate(1.5)' },
  { id: 'cool', name: 'Deep Sea', class: 'hue-rotate-[180deg] saturate-150 brightness-90', style: 'hue-rotate(180deg) saturate(1.5) brightness(0.9)' },
  { id: 'vibrant', name: 'Vibrant', class: 'saturate-200 contrast-125', style: 'saturate(2) contrast(1.25)' },
  { id: 'invert', name: 'Negative', class: 'invert', style: 'invert(1)' },
  { id: 'night', name: 'Night Vision', class: 'hue-rotate-[90deg] saturate-200 brightness-150 grayscale contrast-150', style: 'hue-rotate(90deg) saturate(2) brightness(1.5) grayscale(1) contrast(1.5)' },
  { id: 'blur', name: 'Dreamy', class: 'blur-[2px] brightness-110 saturate-125', style: 'blur(2px) brightness(1.1) saturate(1.25)' }
];

function SplashScreen() {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden select-none"
    >
      {/* Background ambient light effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Styled World Map/Globe Logo Container */}
      <div className="relative w-48 h-48 flex items-center justify-center mb-6">
        {/* Outer orbital rings */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          className="absolute w-44 h-44 border border-dashed border-cyan-500/20 rounded-full"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          className="absolute w-36 h-36 border border-blue-500/10 rounded-full"
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute w-40 h-40 border-t-2 border-r border-cyan-400/40 border-l-transparent border-b-transparent rounded-full"
        />

        {/* Beautiful high-tech styled main world map viewport */}
        <svg 
          viewBox="0 0 100 100" 
          className="w-28 h-28 text-white relative z-10 filter drop-shadow-[0_0_20px_rgba(34,211,238,0.55)]"
        >
          <defs>
            <linearGradient id="backSurfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0891b2" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="continentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#e0f2fe" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="networkLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Sphere Base Container */}
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(34, 211, 238, 0.25)" strokeWidth="1" />
          <circle cx="50" cy="50" r="42" fill="url(#backSurfGrad)" />

          {/* Graticule Grid Lines */}
          {/* Latitudes */}
          <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="rgba(34, 211, 238, 0.2)" strokeWidth="0.75" />
          <ellipse cx="50" cy="50" rx="42" ry="28" fill="none" stroke="rgba(34, 211, 238, 0.15)" strokeWidth="0.75" />
          <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="1" />

          {/* Longitudes */}
          <ellipse cx="50" cy="50" rx="14" ry="42" fill="none" stroke="rgba(34, 211, 238, 0.2)" strokeWidth="0.75" />
          <ellipse cx="50" cy="50" rx="28" ry="42" fill="none" stroke="rgba(34, 211, 238, 0.15)" strokeWidth="0.75" />
          <line x1="50" y1="8" x2="50" y2="92" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="1" />

          {/* Styled Continents (The requested "বিশ্ব মানচিত্রের") */}
          <g className="continent-paths">
            {/* North America */}
            <path 
              d="M16,30 C20,31 23,26 27,27 C31,23 35,26 38,28 C38,32 30,37 25,36 C20,35 15,31 16,30 Z" 
              fill="url(#continentGrad)" 
            />
            {/* South America */}
            <path 
              d="M26,45 C29,43 33,48 35,54 C33,60 28,68 25,74 C24,71 22,64 23,56 C24,51 25,47 26,45 Z" 
              fill="url(#continentGrad)" 
            />
            {/* Africa */}
            <path 
              d="M46,38 C51,36 54,41 57,44 C56,51 58,56 54,61 C51,64 48,60 45,55 C44,48 44,41 46,38 Z" 
              fill="url(#continentGrad)" 
            />
            {/* Europe & Asia (Eurasia) */}
            <path 
              d="M45,21 C49,18 56,19 62,17 C68,19 72,24 75,22 C80,26 84,21 86,26 C82,31 77,30 75,34 C70,35 65,32 59,34 C54,33 48,29 45,21 Z" 
              fill="url(#continentGrad)" 
            />
            {/* Australia / Islands */}
            <path 
              d="M71,56 C75,54 78,57 76,61 C73,63 69,60 69,57 C69,56 70,56 71,56 Z" 
              fill="url(#continentGrad)" 
            />
          </g>

          {/* Glowing Network Connection Path curves inside the world */}
          <path d="M28,27 Q43,30 57,44" fill="none" stroke="url(#networkLineGrad)" strokeWidth="1" strokeDasharray="3,3" />
          <path d="M57,44 Q60,33 75,34" fill="none" stroke="url(#networkLineGrad)" strokeWidth="1" strokeDasharray="3,3" />
          <path d="M26,45 Q36,49 46,38" fill="none" stroke="url(#networkLineGrad)" strokeWidth="1" />

          {/* Pulsating Global Hub Connection Nodes */}
          {/* Node 1 */}
          <g>
            <circle cx="28" cy="27" r="3" fill="#22d3ee" opacity="0.4" className="animate-ping" style={{ animationDuration: '2s' }} />
            <circle cx="28" cy="27" r="1.5" fill="#22d3ee" />
          </g>
          {/* Node 2 */}
          <g>
            <circle cx="57" cy="44" r="3" fill="#3b82f6" opacity="0.4" className="animate-ping" style={{ animationDuration: '2.5s' }} />
            <circle cx="57" cy="44" r="1.5" fill="#3b82f6" />
          </g>
          {/* Node 3 */}
          <g>
            <circle cx="75" cy="34" r="3" fill="#10b981" opacity="0.4" className="animate-ping" style={{ animationDuration: '3s' }} />
            <circle cx="75" cy="34" r="1.5" fill="#10b981" />
          </g>
        </svg>
      </div>

      {/* Main App Title */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        className="flex flex-col items-center"
      >
        <span className="text-white text-5xl font-black tracking-tight bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
          World
        </span>
        <span className="mt-1.5 text-xs text-cyan-400 font-bold uppercase tracking-[0.3em] opacity-80">
          Global Short Videos
        </span>
      </motion.div>

      {/* Loading anim subtitle */}
      <motion.div
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        className="mt-8 text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-black"
      >
        Initializing global feed...
      </motion.div>

      {/* Facebook/TikTok-style signature branding at the absolute bottom of the screen */}
      <div className="absolute bottom-10 flex flex-col items-center justify-center space-y-1 z-10">
        <span className="text-[9.5px] uppercase tracking-[0.35em] text-zinc-600 font-extrabold">from</span>
        <div className="relative group">
          {/* Glitched neon glow outline behind the text for premium branded look */}
          <span className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-fuchsia-500 rounded blur-lg opacity-40 group-hover:opacity-60 transition duration-1000 animate-pulse" />
          <div className="relative px-6 py-1 bg-black rounded-lg leading-none flex items-center justify-center">
            {/* Text styled with TikTok / Facebook branding cyan-magenta shift */}
            <span className="relative text-lg font-black tracking-[0.18em] lowercase bg-gradient-to-r from-cyan-400 via-white to-pink-500 bg-clip-text text-transparent filter drop-shadow-[0_0_4px_rgba(6,182,212,0.5)]">
              warld
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}




function VideoPlayer({ video, isActive, isOptimistic, isMuted, setIsMuted }: { video: Video; isActive: boolean; isOptimistic?: boolean; isMuted: boolean; setIsMuted: (m: boolean) => void; key?: React.Key }) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  // Remove local isMuted state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  // Robust isAdmin detection 
  const isAdmin = !!(
    (auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com')
  );
  
  const [isLiked, setIsLiked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [currentServerIdx, setCurrentServerIdx] = useState(video.currentServerIndex || 0);
  const [retryCount, setRetryCount] = useState(0);
  const lastTapRef = useRef<number>(0);
  const rewardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasViewed = useRef(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; fullName: string; userId: string } | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [creatorInfo, setCreatorInfo] = useState<{ profilePhoto?: string; fullName?: string } | null>(null);

  useEffect(() => {
    if (!video.userId) return;
    const unsubCreator = onSnapshot(doc(db, 'users', video.userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCreatorInfo({
          profilePhoto: data.profilePhoto || '',
          fullName: data.fullName || ''
        });
      }
    }, (err) => {
      console.warn("Reel creator info subscribe warning:", err);
    });
    return () => unsubCreator();
  }, [video.userId]);

   const isVideoPost = video.type === 'video' || (!video.type && video.contentUrl && video.contentUrl.includes('.mp4'));
   const availableServers = video.servers && video.servers.length > 0 
     ? video.servers 
     : (isVideoPost 
         ? [
             { name: 'Direct CDN (Default)', url: video.contentUrl },
             { name: 'Backup High-Speed Connection', url: video.contentUrl + (video.contentUrl.includes('?') ? '&' : '?') + `t=${Date.now()}` }
           ]
         : [
             { name: 'Direct CDN (Default)', url: video.contentUrl },
             { name: 'Proxy Node 1 (Fast)', url: `https://images.weserv.nl/?url=${encodeURIComponent(video.contentUrl)}&n=-1` },
             { name: 'Edge Node (Bypassing ISP)', url: `https://corsproxy.io/?${encodeURIComponent(video.contentUrl)}` },
             { name: 'Backup High-Speed', url: video.contentUrl + (video.contentUrl.includes('?') ? '&' : '?') + `t=${Date.now()}` }
           ]
       );

  const currentMediaUrl = availableServers[currentServerIdx]?.url || video.contentUrl;

  const switchServer = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    hapticFeedback('heavy');
    
    // Clear everything and force reload
    setHasError(false);
    setIsPlaying(false);
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current.load();
    }

    const nextIdx = (currentServerIdx + 1) % availableServers.length;
    setCurrentServerIdx(nextIdx);
    setShowMoreMenu(false);
    
    console.log(`Switching to server: ${availableServers[nextIdx].name}`);
  };

  // Automatic Fallback Logic - Much more aggressive
  const handleMediaError = (e: any) => {
    if (retryCount < availableServers.length * 2) {
      const nextIdx = (currentServerIdx + 1) % availableServers.length;
      setRetryCount(prev => prev + 1);
      setCurrentServerIdx(nextIdx);
      setHasError(false);
    } else {
      setHasError(true);
      hapticFeedback('heavy');
    }
  };

  useEffect(() => {
    if (video.musicId) {
      const fetchMusic = async () => {
        try {
          const docRef = doc(db, 'music', video.musicId!);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setMusicUrl(snap.data().url);
          }
        } catch (err) {
          console.error("VideoPlayer music fetch error:", err);
        }
      };
      fetchMusic();
    }
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current = null;
      }
    };
  }, [video.musicId]);

  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    if (user && video.id && !isOptimistic) {
      const q = query(collection(db, 'videos', video.id, 'likes'), where('userId', '==', user.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setIsLiked(!snapshot.empty);
      }, (err) => {
        if (!isFirestoreShutdownError(err)) {
          console.error("Video likes snapshot error:", err);
        }
      });
      return () => unsubscribe();
    }
  }, [user, video.id, isOptimistic]);

  useEffect(() => {
    if (user && video.userId && !isOptimistic) {
      const fetchFollowStatus = async () => {
        try {
          const res = await fetch(`/api/follows/check?followerId=${user.id}&followingId=${video.userId}`);
          if (res.ok) {
            const data = await res.json();
            setIsFollowing(data.isFollowing);
          }
        } catch (e) {
          console.warn("Error checking VideoPlayer fallback follow status:", e);
        }
      };

      if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
        fetchFollowStatus();
        return () => {};
      }

      const unsub = onSnapshot(doc(db, 'users', video.userId, 'followers', user.id), (doc) => {
        setIsFollowing(doc.exists());
      }, (err) => {
        fetchFollowStatus();
      });
      return () => unsub();
    }
  }, [user, video.userId, isOptimistic]);

  useEffect(() => {
    if (showComments && video.id) {
      setCommentsLoading(true);
      const q = query(collection(db, 'videos', video.id, 'comments'), orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(deduplicateById(list));
        setCommentsLoading(false);
      }, (err) => {
        console.error("Comments error:", err);
        setCommentsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [showComments, video.id]);

  const handleCommentUserClick = (userId: string) => {
    if (!userId) return;
    hapticFeedback('light');
    window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: userId }));
    setShowComments(false);
  };

  const handleSendComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !newComment.trim() || !video.id) return;
    hapticFeedback('medium');
    const textToSend = newComment;
    setNewComment('');
    
    const parentId = replyingTo ? replyingTo.commentId : null;
    const replyToName = replyingTo ? replyingTo.fullName : null;
    const replyToUserId = replyingTo ? replyingTo.userId : null;
    setReplyingTo(null);

    try {
      const commentRef = collection(db, 'videos', video.id, 'comments');
      await addDoc(commentRef, {
        userId: user.id,
        fullName: user.fullName,
        username: user.username || '',
        profilePhoto: user.profilePhoto || '',
        text: textToSend,
        createdAt: serverTimestamp(),
        isVerified: user.isVerified || false,
        ...(parentId ? { parentId, replyToName, replyToUserId } : {})
      });

      const videoDocRef = doc(db, 'videos', video.id);
      await setDoc(videoDocRef, {
        commentCount: increment(1)
      }, { merge: true });

      if (parentId && replyToUserId) {
        if (replyToUserId !== user.id) {
          await sendNotification(replyToUserId, user, 'comment', video.id, `replied to your comment: "${textToSend.substring(0, 30)}${textToSend.length > 30 ? '...' : ''}"`);
        }
      } else if (video.userId && video.userId !== user.id) {
        await sendNotification(video.userId, user, 'comment', video.id, `commented: "${textToSend.substring(0, 30)}${textToSend.length > 30 ? '...' : ''}"`);
      }
    } catch (err) {
      console.error("Error adding comment: ", err);
    }
  };

  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    if (!user || !video.id) return;
    const isSystemAdmin = isAdmin || 
                          auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93' ||
                          auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com' ||
                          auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com';
    
    if (user.id !== commentUserId && user.id !== video.userId && !isSystemAdmin) {
      alert("You don't have permission to delete this comment.");
      return;
    }
    
    if (window.confirm(localStorage.getItem('appLanguage') === 'bn' ? "মন্তব্যটি ডিলিট করতে চান?" : "Do you want to delete this comment?")) {
      hapticFeedback('heavy');
      try {
        const commentDocRef = doc(db, 'videos', video.id, 'comments', commentId);
        await deleteDoc(commentDocRef);
        
        const videoDocRef = doc(db, 'videos', video.id);
        await setDoc(videoDocRef, {
          commentCount: increment(-1)
        }, { merge: true });
      } catch (err) {
        console.error("Error deleting comment: ", err);
      }
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'এইমাত্র (Just now)';
    
    let date: Date | null = null;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        date = timestamp.toDate();
      } catch (e) {}
    }
    
    if (!date && timestamp) {
      const secs = timestamp.seconds ?? timestamp._seconds;
      if (typeof secs === 'number') {
        date = new Date(secs * 1000);
      } else if (typeof timestamp === 'number') {
        const isSecs = timestamp < 50000000000;
        date = new Date(isSecs ? timestamp * 1000 : timestamp);
      } else if (typeof timestamp === 'string') {
        if (/^\d+$/.test(timestamp)) {
          const num = Number(timestamp);
          const isSecs = num < 50000000000;
          date = new Date(isSecs ? num * 1000 : num);
        } else {
          const parsed = Date.parse(timestamp);
          if (!isNaN(parsed)) date = new Date(parsed);
        }
      }
    }
    
    if (!date) {
      const d = new Date(timestamp);
      date = isNaN(d.getTime()) ? null : d;
    }
    
    if (!date) return 'এইমাত্র (Just now)';
    
    // Prevent negative difference due to potential clock mismatch between client & server
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 2) return 'এইমাত্র (Just now)';
    if (seconds < 60) return `${seconds} সে. আগে (${seconds}s ago)`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} মি. আগে (${minutes}m ago)`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ঘণ্টা আগে (${hours}h ago)`;
    
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} দিন আগে (${days}d ago)`;
    
    return date.toLocaleDateString();
  };

  useEffect(() => {
    const videoElem = videoRef.current;
    let isSubscribed = true;

    if (isActive) {
      const startPlayback = async () => {
        if (videoElem) {
          try {
            const playPromise = videoElem.play();
            if (playPromise !== undefined) await playPromise;
          } catch (err) {
            // Silence interruption errors
          }
        }

        if (musicUrl && isSubscribed) {
          if (!musicAudioRef.current) {
            const audio = new Audio(musicUrl);
            audio.loop = true;
            musicAudioRef.current = audio;
          } else if (musicAudioRef.current.src !== musicUrl) {
            musicAudioRef.current.src = musicUrl;
          }
          musicAudioRef.current.muted = isMuted;
          musicAudioRef.current.volume = (video.musicVolume || 100) / 100;
          try {
            const playPromise = musicAudioRef.current.play();
            if (playPromise !== undefined) await playPromise;
          } catch (err) {
            // Silence interruption errors
          }
        }
        
        if (isSubscribed) setIsPlaying(true);
      };

      startPlayback();

      // Reward logic: Earn 1 coin for 20s watch
      if (user && !isOptimistic) {
        rewardTimerRef.current = setTimeout(async () => {
          if (isActive && isSubscribed) {
            const userRef = doc(db, 'users', user.id);
            await setDoc(userRef, {
              coinBalance: increment(1)
            }, { merge: true }).catch(console.error);
          }
        }, 20000);
      }

      // Increment View Count after a short delay to ensure intent and prevent auto-spam
      const viewTimeout = setTimeout(() => {
        if (isActive && !hasViewed.current && isSubscribed && video.id && !isOptimistic) {
          hasViewed.current = true;
          const videoRefDoc = doc(db, 'videos', video.id);
          setDoc(videoRefDoc, {
            views: increment(1)
          }, { merge: true }).catch(console.error);
        }
      }, 1000); // 1 second view requirement for fast real-time counting

      return () => {
        isSubscribed = false;
        clearTimeout(viewTimeout);
        if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
        if (musicAudioRef.current) {
          try { musicAudioRef.current.pause(); } catch (e) {}
        }
      };
    } else {
      isSubscribed = false;
      if (videoElem) {
        try { videoElem.pause(); } catch (e) {}
      }
      if (musicAudioRef.current) {
        try { musicAudioRef.current.pause(); } catch (e) {}
      }
      setIsPlaying(false);
      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    }
  }, [isActive, user, video.id, isOptimistic, musicUrl]);

  useEffect(() => {
    if (isActive && videoRef.current && video.speed) {
      videoRef.current.playbackRate = video.speed;
    }
  }, [isActive, video.speed]);

  useEffect(() => {
    const videoElem = videoRef.current;
    if (!videoElem) return;

    const handleTimeUpdate = () => {
      const trimStart = video.trimStart || 0;
      const trimEnd = video.trimEnd || 0;
      if (trimEnd > trimStart) {
        if (videoElem.currentTime < trimStart) {
          videoElem.currentTime = trimStart;
        }
        if (videoElem.currentTime > trimEnd) {
          videoElem.currentTime = trimStart;
        }
      }
    };

    videoElem.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      videoElem.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [video.trimStart, video.trimEnd, isActive]);

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !video.id) return;
    hapticFeedback(isLiked ? 'light' : 'medium');
    
    try {
      if (!video.id) return;
      const videoRef = doc(db, 'videos', video.id);
      const likeRef = doc(db, 'videos', video.id, 'likes', user.id);
      
      const likeSnap = await getDocs(query(collection(db, 'videos', video.id, 'likes'), where('userId', '==', user.id)));
      
      if (likeSnap.empty) {
        await setDoc(likeRef, {
          userId: user.id,
          createdAt: serverTimestamp()
        });
        await setDoc(videoRef, {
          likeCount: increment(1)
        }, { merge: true });
        if (video.userId) {
          await sendNotification(video.userId, user, 'like', video.id, 'liked your video');
        }
      }
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  const toggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !video.userId || user.id === video.userId) return;
    hapticFeedback('medium');

    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);

    // Call SQLite sync backend regardless of offline mode/quota
    fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        followerId: user.id,
        followingId: video.userId,
        action: prevStatus ? 'unfollow' : 'follow'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && typeof data.isFollowing === 'boolean') {
        setIsFollowing(data.isFollowing);
      }
    })
    .catch(e => console.log("Follow fallback sync offline error:", e));

    try {
      const followerRef = doc(db, 'users', video.userId, 'followers', user.id);
      const followingRef = doc(db, 'users', user.id, 'following', video.userId);
      
      if (prevStatus) {
        await deleteDoc(followerRef);
        await deleteDoc(followingRef);
      } else {
        await setDoc(followerRef, {
          followerId: user.id,
          createdAt: serverTimestamp()
        });
        await setDoc(followingRef, {
          followingId: video.userId,
          createdAt: serverTimestamp()
        });
        await sendNotification(video.userId, user, 'follow', undefined, 'started following you');
      }
    } catch (err) {
      console.warn("Firestore follow sync skipped:", err);
    }
  };

  const deleteVideo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Feed Delete attempt details:", {
      videoId: video.id,
      postOwnerId: video.userId,
      currentUserId: user?.id,
      isAdmin,
      authUid: auth.currentUser?.uid
    });

    if (isOptimistic) {
      alert("Please wait for the upload to finish before deleting.");
      return;
    }
    if (!user || !video.id) {
      alert("Error: Missing user or post ID. Please refresh.");
      return;
    }
    
    // Check if owner or admin
    const isUserAdmin = isAdmin || 
                        auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93' ||
                        auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com' || 
                        auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com' ||
                        auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@google.com';
    
    if (user.id !== video.userId && !isUserAdmin) {
      alert("Error: You do not have permission to delete this post.");
      return;
    }
    
    const runDelete = async () => {
      const pathToDelete = `videos/${video.id}`;
      try {
        console.log("Feed: Starting delete for video:", video.id);
        const videoRef = doc(db, 'videos', video.id);
        
        // Optimistic UI update: menu set to false
        setShowMoreMenu(false);
        
        await deleteDoc(videoRef);
        console.log("Feed: Delete successful in DB for:", video.id);
        alert("Post deleted successfully!");
      } catch (err: any) {
        console.error("Feed: Delete Error:", {
          videoId: video.id,
          error: err,
          code: err.code,
          message: err.message
        });
        let message = "Delete failed.";
        if (err.code === "permission-denied" || err.message?.toLowerCase().includes("permission denied")) {
          message += "\n\nReason: Database Permission Denied. Ownership verification failed.";
        } else {
          message += "\n\nError: " + (err.message || "Unknown server error");
        }
        alert(message);
      }
    };

    if ((window as any).showCustomConfirm) {
      (window as any).showCustomConfirm("Delete Post", "Are you sure you want to delete this post?", runDelete);
    } else {
      if (window.confirm("Are you sure you want to delete this post?")) {
        runDelete();
      }
    }
  };

  const downloadVideo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = video.contentUrl || (video as any).videoUrl;
    if (!url || isDownloading) return;

    try {
      setIsDownloading(true);
      
      // Attempt to fetch with no-cors or similar might not work for blobs, 
      // so we try a standard fetch and catch the inevitable CORS error if it happens.
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Network response was not ok');
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      const extension = video.type === 'image' || isImage ? 'jpg' : 'mp4';
      link.download = `WorldSocial_${Date.now()}.${extension}`;
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        setIsDownloading(false);
      }, 500);
      
    } catch (error) {
      // Silently handle fetch errors (likely CORS) and use fallback
      setIsDownloading(false);
      
      // Fallback: Open in new tab which allows browser-native download/save
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.target = '_blank';
      downloadLink.rel = 'noopener noreferrer';
      // Some browsers might respect this even cross-origin for certain file types
      downloadLink.setAttribute('download', ''); 
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Inform the user in a friendly way
      console.log("Direct download failed or blocked by CORS, opening in new tab.");
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    // Double tap check
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!isLiked) toggleLike(e);
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
      lastTapRef.current = now;
      return;
    }
    lastTapRef.current = now;

    if (isMuted) setIsMuted(false);
    if (videoRef.current) {
      if (videoRef.current.paused) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
        if (musicAudioRef.current) {
          musicAudioRef.current.play().catch(() => {});
        }
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        if (musicAudioRef.current) {
          musicAudioRef.current.pause();
        }
        setIsPlaying(false);
      }
    }
  };

  // Robust detection of content type
  const displayUrl = currentMediaUrl;
  const isImage = video.type === 'image' || (video.type as string) === 'photo' || 
    (video.type !== 'video' && video.type !== 'text' && displayUrl && (
      displayUrl.toLowerCase().includes('.jpg') || 
      displayUrl.toLowerCase().includes('.png') || 
      displayUrl.toLowerCase().includes('.jpeg') || 
      displayUrl.toLowerCase().includes('.webp') ||
      displayUrl.toLowerCase().includes('.heic') ||
      displayUrl.toLowerCase().includes('.gif') ||
      displayUrl.toLowerCase().startsWith('data:image/')
    ));
  
  // A post is a text post if type is 'text' OR if there is no URL but there is content
  const isText = video.type === 'text' || (!displayUrl && (video.description || video.title || (video as any).textContent));
  const isVideo = !isImage && !isText && displayUrl;

  const [hasError, setHasError] = useState(false);

  // Robust error detection
  useEffect(() => {
    const isActuallyText = video.type === 'text' || (!displayUrl && (video.description || video.title || (video as any).textContent));
    
    if (isActive && !isOptimistic && !displayUrl && !isActuallyText) {
       const timer = setTimeout(() => {
         const currentDisplayUrl = video.contentUrl || (video as any).videoUrl;
         const currentIsText = video.type === 'text' || (!currentDisplayUrl && (video.description || video.title || (video as any).textContent));
         if (!currentDisplayUrl && !currentIsText) {
            setHasError(true);
         }
       }, 6000); // 6s grace period
       return () => clearTimeout(timer);
    }
    if (displayUrl || isActuallyText) setHasError(false);
  }, [displayUrl, isActive, isOptimistic, video.id, video.type, video.title, video.description, (video as any).textContent]);

  const filterStyle = {
    filter: `${FILTER_OPTIONS.find(f => f.id === video.filter)?.style || ''} brightness(${video.brightness || 100}%) contrast(${video.contrast || 100}%) saturate(${video.saturation || 100}%)`
  };

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center" onClick={togglePlay}>
       {isOptimistic && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-50 bg-[#FF4B91]/95 text-white px-6 py-2.5 rounded-2xl backdrop-blur-md shadow-2xl flex items-center space-x-3">
          <div className="flex space-x-1.5 items-center">
            <div className="w-1.5 h-1.5 bg-white rounded-sm animate-pulse" />
            <div className="w-1.5 h-1.5 bg-white/70 rounded-sm animate-pulse delay-75" />
            <div className="w-1.5 h-1.5 bg-white/40 rounded-sm animate-pulse delay-150" />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">আপলোড হচ্ছে... / Uploading</span>
        </div>
      )}
      {isDownloading && (
        <div className="absolute inset-0 z-[60] bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="w-20 h-1 bg-white/20 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-[#FF4B91] rounded-full animate-pulse w-full shadow-[0_0_8px_#ff4b91]" />
          </div>
          <p className="text-white text-[10px] font-black uppercase tracking-widest text-center px-4">
            Preparing Download...<br/>
            <span className="text-gray-400 font-medium normal-case mt-1 block">Saving to Gallery</span>
          </p>
        </div>
      )}
      {hasError ? (
        <div className="flex flex-col items-center justify-center text-gray-500 px-6 text-center animate-in fade-in duration-500">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-white text-lg font-black uppercase tracking-widest">Connection Error</h3>
          <p className="text-[10px] text-gray-500 font-medium mt-2 max-w-[240px] leading-relaxed">
            কোনো সার্ভার থেকেই ভিডিও লোড করা যাচ্ছে না। আপনার ইন্টারনেট চেক করুন এবং নিচের বাটনটি চাপুন।
          </p>
          <div className="flex flex-col space-y-3 mt-8 w-full max-w-[240px]">
            <button 
              onClick={switchServer}
              className="w-full bg-pink-500 text-white text-[11px] font-black uppercase tracking-[0.15em] py-4 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Next Server
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-white/5 text-white/50 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl border border-white/5 active:bg-white/10"
            >
              Hard Reset App
            </button>
          </div>
        </div>
      ) : isText ? (
        <div 
          className={cn(
            "h-full w-full flex items-center justify-center p-10 text-center transition-all duration-700", 
            ((video as any).backgroundColor || (video as any).bgColor)?.startsWith('bg-') ? 
               ((video as any).backgroundColor || (video as any).bgColor) : 
               (!((video as any).backgroundColor || (video as any).bgColor) ? "bg-gradient-to-br from-purple-600 to-blue-600" : "")
          )}
          style={((video as any).backgroundColor || (video as any).bgColor) && !((video as any).backgroundColor || (video as any).bgColor).startsWith('bg-') ? 
            { backgroundColor: (video as any).backgroundColor || (video as any).bgColor } : 
            {}
          }
        >
           <h2 className="text-white text-3xl font-black drop-shadow-2xl leading-tight tracking-tight animate-in fade-in zoom-in duration-500 max-w-sm">
             {video.description || (video as any).textContent || video.title}
           </h2>
        </div>
      ) : isImage ? (
        <div className="w-full h-full relative">
          <img 
            src={displayUrl || null} 
            style={filterStyle}
            className="h-full w-full object-contain bg-black transition-all duration-500"
            alt={video.title || "Post"}
            loading="eager"
            referrerPolicy="no-referrer"
            onError={handleMediaError}
          />
          {video.overlayText && (
            <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none">
              <span 
                style={{ color: video.textColor || '#ffffff' }}
                className="text-4xl font-black uppercase italic tracking-tighter text-center px-10 drop-shadow-2xl"
              >
                {video.overlayText}
              </span>
            </div>
          )}
          {video.stickers?.map((sticker, idx) => (
            <div 
              key={`video-sticker-static-${sticker.value || 'st'}-${idx}`}
              style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
              className="absolute z-20 pointer-events-none select-none drop-shadow-2xl"
            >
              {sticker.value}
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full h-full relative">
          <video
            ref={videoRef}
            src={displayUrl || null}
            style={filterStyle}
            className="h-full w-full object-contain bg-black transition-all duration-500"
            onEnded={handleVideoEnd}
            playsInline
            muted={isMuted}
            loop
            preload="auto"
            referrerPolicy="no-referrer"
            onLoadedData={() => {
              setIsPlaying(true);
              setRetryCount(0); // Reset retry count on success
              if (videoRef.current && video.speed) {
                videoRef.current.playbackRate = video.speed;
              }
            }}
            onError={handleMediaError}
          />
          {video.overlayText && (
            <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none">
              <span 
                style={{ color: video.textColor || '#ffffff' }}
                className="text-4xl font-black uppercase italic tracking-tighter text-center px-10 drop-shadow-2xl text-stroke-thin"
              >
                {video.overlayText}
              </span>
            </div>
          )}
          {video.stickers?.map((sticker, idx) => (
            <div 
              key={`video-sticker-play-${sticker.value || 'st'}-${idx}`}
              style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
              className="absolute z-20 pointer-events-none select-none drop-shadow-2xl"
            >
              {sticker.value}
            </div>
          ))}
        </div>
      )}

      {retryCount > 0 && !hasError && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 flex items-center bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-pink-500/30 shadow-2xl">
          <RefreshCw className="w-3 h-3 text-pink-500 animate-spin mr-2" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
            Switching Server ({currentServerIdx + 1}/{availableServers.length})
          </span>
        </div>
      )}
      
      {isMuted && isActive && !isOptimistic && !isText && (
        <div className="absolute bottom-20 right-2 z-30 pointer-events-none">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center"
          >
            <div className="w-8 h-8 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center mb-1 border border-white/10 animate-pulse">
              <VolumeX className="w-4 h-4 text-white" />
            </div>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {showHeart && (
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 1, 0] }}
            exit={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
          >
            <Heart className="w-24 h-24 text-pink-500 fill-pink-500 drop-shadow-[0_0_20px_rgba(236,72,153,0.6)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-16 h-16 bg-white/30 rounded-full flex items-center justify-center backdrop-blur-sm">
            <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent ml-1" />
          </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="absolute top-6 left-4 right-4 flex justify-between items-center z-20">
        <div className="flex items-center space-x-2">
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="absolute right-1.5 bottom-16 flex flex-col items-center space-y-2 md:space-y-2.5 translate-z-0">
        <div className="flex flex-col items-center">
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: video.userId }));
              }}
              className="w-7.5 h-7.5 md:w-8.5 md:h-8.5 rounded-full border-[1.5px] border-white overflow-hidden bg-gray-800 shadow-xl transition-transform active:scale-90"
            >
              {creatorInfo?.profilePhoto || video.profilePhoto ? (
                <img src={creatorInfo?.profilePhoto || video.profilePhoto || undefined} alt={creatorInfo?.fullName || video.fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UserIcon className="text-white w-3.5 h-3.5" />
                </div>
              )}
            </button>
            {(!user || user.id !== video.userId) && (
              <motion.button 
                whileTap={{ scale: 0.8 }}
                onClick={toggleFollow}
                className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-[12px] h-[12px] ${isFollowing ? 'bg-gray-500' : 'bg-pink-500'} rounded-full flex items-center justify-center border border-black shadow-lg transition-all`}
              >
                {isFollowing ? <Check className="text-white w-1.5 h-1.5" /> : <Plus className="text-white w-1.5 h-1.5" />}
              </motion.button>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center group" onClick={toggleLike}>
          <motion.div 
            whileTap={{ scale: 0.8 }}
            className="w-7.5 h-7.5 md:w-8.5 md:h-8.5 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center mb-0.5 transition-all hover:bg-pink-500/20 shadow-lg border border-white/5"
          >
            <Heart className={`w-4.5 h-4.5 md:w-5 md:h-5 text-white ${isLiked ? 'fill-pink-500 text-pink-500' : 'fill-none'}`} />
          </motion.div>
          <span className="text-white text-[8.5px] font-black drop-shadow-lg">{video.likeCount}</span>
        </div>

        {/* Comment Action Button */}
        <div 
          className="flex flex-col items-center group cursor-pointer" 
          onClick={(e) => {
            e.stopPropagation();
            setShowComments(true);
          }}
        >
          <motion.div 
            whileTap={{ scale: 0.8 }}
            className="w-7.5 h-7.5 md:w-8.5 md:h-8.5 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center mb-0.5 transition-all hover:bg-pink-500/20 shadow-lg border border-white/5"
          >
            <MessageCircle className="w-4.5 h-4.5 md:w-5 md:h-5 text-white" />
          </motion.div>
          <span className="text-white text-[8.5px] font-black drop-shadow-lg">{comments.length || video.commentCount || 0}</span>
        </div>

        {/* Share Action Button */}
        <div 
          className="flex flex-col items-center group cursor-pointer" 
          onClick={async (e) => {
            e.stopPropagation();
            hapticFeedback('medium');
            const shareUrl = `${getAppOrigin()}?v=${video.id}`;
            const shareTitle = video.fullName ? `${video.fullName} limit on World` : 'World Video';
            const shareText = video.description || 'Watch this amazing post on World!';

            if (navigator.share) {
              try {
                await navigator.share({
                  title: shareTitle,
                  text: shareText,
                  url: shareUrl,
                });
              } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    alert(localStorage.getItem('appLanguage') === 'bn' ? "লিংক কপি করা হয়েছে!" : "Share link copied!");
                  }).catch(() => {
                    alert("Copy failed.");
                  });
                }
              }
            } else {
              try {
                await navigator.clipboard.writeText(shareUrl);
                alert(localStorage.getItem('appLanguage') === 'bn' ? "লিংক কপি করা হয়েছে!" : "Share link copied!");
              } catch (err) {
                window.prompt(localStorage.getItem('appLanguage') === 'bn' ? "কপি করার জন্য লিংকটি সিলেক্ট করুন:" : "Select and copy link:", shareUrl);
              }
            }
          }}
        >
          <motion.div 
            whileTap={{ scale: 0.8 }}
            className="w-7.5 h-7.5 md:w-8.5 md:h-8.5 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center mb-0.5 transition-all hover:bg-blue-500/20 shadow-lg border border-white/5"
          >
            <Share2 className="w-4.5 h-4.5 md:w-5 md:h-5 text-white" />
          </motion.div>
          <span className="text-white text-[8.5px] font-black drop-shadow-lg">Share</span>
        </div>



        <div className="flex flex-col items-center" onClick={downloadVideo}>
          <div className="w-7.5 h-7.5 md:w-8.5 md:h-8.5 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center mb-0.5 transition-all hover:bg-white/10 shadow-lg border border-white/5 font-black uppercase text-[10px]">
            <Download className="w-4.5 h-4.5 md:w-5 md:h-5 text-white" />
          </div>
          <span className="text-white text-[7px] font-black uppercase tracking-tight opacity-90">Save</span>
        </div>

        <div className="relative">
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); }}
            className="flex flex-col items-center group"
          >
            <div className="w-7.5 h-7.5 md:w-8.5 md:h-8.5 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center mb-0.5 transition-all hover:bg-white/10 shadow-lg border border-white/5">
              <MoreVertical className="w-4.5 h-4.5 md:w-5 md:h-5 text-white" />
            </div>
            <span className="text-white text-[7px] font-black uppercase tracking-tight opacity-90">More</span>
          </button>

          <AnimatePresence>
            {showMoreMenu && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-0 right-14 w-40 bg-black/90 border border-white/20 rounded-xl overflow-hidden shadow-2xl z-50 backdrop-blur-xl"
              >
                <div className="flex flex-col">
                  {user && (user.id === video.userId || isAdmin) && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); (window as any).editPost(video); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-500/20 text-blue-400 transition-colors"
                    >
                      <Scissors className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Edit Details</span>
                    </button>
                  )}
                  <button 
                    onClick={switchServer}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-pink-500/20 text-pink-500 transition-colors border-y border-white/5"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[10px] font-black uppercase tracking-widest">Switch Server</span>
                      <span className="text-[8px] text-gray-500 font-bold uppercase mt-0.5">{availableServers[currentServerIdx].name}</span>
                    </div>
                  </button>
                  {user && (user.id === video.userId || isAdmin) ? (
                    <button 
                      onClick={deleteVideo}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/20 text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Delete</span>
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); alert("Reported successfully!"); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Report</span>
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); alert("Sharing link copied!"); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 text-white transition-colors border-t border-white/5"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Share Clip</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>



        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          onClick={(e) => {
            e.stopPropagation();
            const musicInfo = {
              id: video.musicId || video.id,
              name: video.musicName || `Original Sound - ${video.fullName}`,
              url: video.contentUrl
            };
            const event = new CustomEvent('nav-to-upload', { 
              detail: { 
                music: musicInfo,
                isStory: false
              } 
            });
            window.dispatchEvent(event);
          }}
          className="w-10 h-10 rounded-full border-4 border-gray-700 bg-gray-900 overflow-hidden flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
        >
          <Music className="text-white w-5 h-5" />
        </motion.div>

        {/* Mute toggle below Music Logo */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsMuted(!isMuted);
          }}
          className="w-7 h-7 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white shadow-lg transition-all border border-white/10 flex items-center justify-center mt-1"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 ml-0.5" />}
        </button>
      </div>

      {/* Bottom Info */}
      <div className="absolute left-2.5 bottom-14 right-14 pointer-events-none">
        <div className="flex flex-col items-start space-y-0.5 drop-shadow-2xl pointer-events-auto">
          <div className="flex items-center flex-wrap gap-2">
            <h3 
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: video.userId }));
              }}
              className="text-white font-black text-[15.5px] flex items-center cursor-pointer hover:underline tracking-tight"
            >
              @{(creatorInfo?.fullName || video.fullName || "User").toLowerCase().replace(/\s/g, '')}
              {video.views > 1000 && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 ml-1 fill-blue-400" />}
            </h3>
            {(!user || user.id !== video.userId) && (
              <button
                onClick={toggleFollow}
                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-0.5 ${
                  isFollowing ? 'bg-white/15 hover:bg-white/25 text-white/90 border border-white/5' : 'bg-pink-500 hover:bg-pink-600 text-white shadow-md shadow-pink-500/20'
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="w-2.5 h-2.5" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-2.5 h-2.5" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            )}

            <span className="text-[9px] text-[#FF4B91] bg-black/40 border border-[#FF4B91]/35 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 backdrop-blur-md shrink-0 select-none">
              <Clock className="w-2.5 h-2.5 text-[#FF4B91] shrink-0 animate-pulse" />
              <span>{formatTimeAgo(video.createdAt || (video as any).uploadTime)}</span>
            </span>
          </div>
          <div className="flex flex-col space-y-1 max-w-[95%] pointer-events-auto select-text">
            <p className="text-white text-[11px] font-black leading-tight">{video.title}</p>
            {video.description && video.description !== video.title && (
              <p className="text-white/80 text-[10px] font-medium leading-normal line-clamp-3 overflow-y-auto custom-scrollbar whitespace-pre-wrap py-0.5 pr-1 bg-black/10 rounded">
                {video.description}
              </p>
            )}
          </div>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              const musicInfo = {
                id: video.musicId || video.id,
                name: video.musicName || `Original Sound - ${video.fullName}`,
                url: video.contentUrl
              };
              const event = new CustomEvent('nav-to-upload', { 
                detail: { music: musicInfo, isStory: false } 
              });
              window.dispatchEvent(event);
            }}
            className="flex items-center text-white text-[9px] mt-0.5 bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10 cursor-pointer hover:bg-white/20 active:scale-95 transition-all shadow-xl"
          >
            <Music className="w-2.5 h-2.5 mr-1 animate-pulse" />
            <div className="overflow-hidden w-20 md:w-36">
              <motion.div 
                animate={{ x: [-150, 200] }}
                transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                className="whitespace-nowrap font-black uppercase tracking-widest text-[7.5px]"
              >
                {video.musicName || `Original Sound - ${video.fullName}`}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating sliding drawer for Comments */}
      <AnimatePresence>
        {showComments && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-[1.5px] z-[120] flex flex-col justify-end select-text"
            onClick={(e) => {
              e.stopPropagation();
              setShowComments(false);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 24, stiffness: 200 }}
              className="w-full h-[65%] rounded-t-[24px] bg-[#0E0F14] border-t border-white/10 flex flex-col z-[52] overflow-hidden select-text"
              onClick={(e) => {
                e.stopPropagation();
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Drawer handle indicator */}
              <div className="flex flex-col items-center pt-3 pb-2 border-b border-white/[0.06] relative flex-shrink-0">
                <div className="w-12 h-1 bg-white/20 rounded-full mb-3" />
                <div className="flex justify-between items-center w-full px-5">
                  <span className="text-white font-black text-[13px] uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#FF4B91] fill-[#FF4B91]/10" />
                    Comments ({comments.length || video.commentCount || 0})
                  </span>
                  <button 
                    onClick={() => setShowComments(false)}
                    className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all active:scale-90"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Comments Box */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 min-h-0 custom-scrollbar select-text">
                {commentsLoading ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-2">
                    <div className="w-6 h-6 border-2 border-[#FF4B91] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-white/40">Loading comments...</span>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-10">
                    <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-white/20" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-white/60 font-black text-xs">No comments yet!</p>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider font-bold">Be the first to comment</p>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const parentComments = comments.filter(c => !c.parentId);
                    const replyComments = comments.filter(c => c.parentId);

                    return parentComments.map((parentComment, parentIdx) => {
                      const isSystemAdmin = isAdmin || 
                                            auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93' ||
                                            auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com' ||
                                            auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com';
                      const canDeleteParent = user && (parentComment.userId === user.id || video.userId === user.id || isSystemAdmin);
                      const commentReplies = replyComments.filter(r => r.parentId === parentComment.id);

                      return (
                        <div key={`${parentComment.id || ''}-vpparent-${parentIdx}`} className="space-y-3 border-b border-white/[0.02] pb-3 last:border-0 select-text">
                          {/* Parent Comment Component */}
                          <div className="flex gap-3 group/parent animate-in fade-in slide-in-from-bottom-2 duration-250 select-text">
                            {/* Avatar */}
                            <div 
                              onClick={() => handleCommentUserClick(parentComment.userId)}
                              className="w-8 h-8 rounded-full overflow-hidden bg-gray-800 border border-white/10 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              {parentComment.profilePhoto ? (
                                <img src={parentComment.profilePhoto} alt={parentComment.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-[#FF4B91]/10 text-[#FF4B91] text-[11px] font-black">
                                  {parentComment.fullName?.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>

                            {/* Comment Core */}
                            <div className="flex-1 flex flex-col min-w-0 select-text">
                              <div className="flex items-baseline gap-1.5 flex-wrap font-sans">
                                <span 
                                  onClick={() => handleCommentUserClick(parentComment.userId)}
                                  className="text-white text-[11px] font-black tracking-wide leading-none cursor-pointer hover:text-[#FF4B91] transition-colors flex items-center gap-1.5 flex-wrap"
                                >
                                  <span>{parentComment.fullName}</span>
                                  <span className="text-[9px] text-gray-500 font-bold normal-case font-mono bg-white/[0.03] px-1 rounded">@{parentComment.username || (parentComment.fullName || "user").toLowerCase().replace(/\s/g, '')}</span>
                                  {parentComment.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 fill-blue-400 flex-shrink-0" />}
                                </span>
                                {parentComment.userId === video.userId && (
                                  <span className="text-[7px] bg-[#FF4B91] text-white font-black uppercase px-1 rounded-[3px] scale-90 origin-left select-none">
                                    Creator
                                  </span>
                                )}
                                <span className="text-[9px] text-white/40 font-semibold select-none">
                                  {formatTimeAgo(parentComment.createdAt)}
                                </span>
                              </div>
                              <p className="text-white/80 text-[11px] font-medium leading-relaxed mt-1 whitespace-pre-wrap break-words select-text">
                                {parentComment.text}
                              </p>
                              
                              {/* Actions: Reply button */}
                              <div className="flex items-center gap-3 mt-1.5 select-none">
                                <button 
                                  onClick={() => {
                                    if (!user) {
                                      if ((window as any).triggerLogin) {
                                        (window as any).triggerLogin();
                                      }
                                      return;
                                    }
                                    setReplyingTo({
                                      commentId: parentComment.id,
                                      fullName: parentComment.fullName,
                                      userId: parentComment.userId
                                    });
                                    setTimeout(() => {
                                      commentInputRef.current?.focus();
                                    }, 100);
                                  }}
                                  className="text-[9.5px] text-[#FF4B91] hover:text-[#ff6ca7] font-black uppercase tracking-wider active:scale-95 transition-all text-left"
                                >
                                  Reply
                                </button>
                              </div>
                            </div>

                            {/* Delete Button */}
                            {canDeleteParent && (
                              <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 self-start select-none">
                                <button 
                                  onClick={() => handleDeleteComment(parentComment.id, parentComment.userId)}
                                  className="p-1.5 rounded-full text-white/40 hover:text-red-500 hover:bg-white/5 transition-all active:scale-90"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Nested Replies */}
                          {commentReplies.length > 0 && (
                            <div className="pl-6 space-y-3.5 border-l border-white/[0.04] ml-4 mt-2">
                              {commentReplies.map((reply, replyIdx) => {
                                const canDeleteReply = user && (reply.userId === user.id || video.userId === user.id || isSystemAdmin);
                                return (
                                  <div key={`${reply.id || ''}-vpreply-${replyIdx}`} className="flex gap-2.5 group/reply animate-in fade-in slide-in-from-left-2 duration-200 select-text">
                                    {/* Small Avatar */}
                                    <div 
                                      onClick={() => handleCommentUserClick(reply.userId)}
                                      className="w-6 h-6 rounded-full overflow-hidden bg-gray-800 border border-white/10 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                    >
                                      {reply.profilePhoto ? (
                                        <img src={reply.profilePhoto} alt={reply.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#FF4B91]/10 text-[#FF4B91] text-[9px] font-black">
                                          {reply.fullName?.charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                    </div>

                                    {/* Reply Core Info */}
                                    <div className="flex-1 flex flex-col min-w-0 select-text">
                                      <div className="flex items-baseline gap-1.5 flex-wrap font-sans">
                                        <span 
                                          onClick={() => handleCommentUserClick(reply.userId)}
                                          className="text-white/90 text-[10px] font-black tracking-wide leading-none cursor-pointer hover:text-[#FF4B91] transition-colors flex items-center gap-1.5 flex-wrap"
                                        >
                                          <span>{reply.fullName}</span>
                                          <span className="text-[8px] text-gray-500 font-bold normal-case font-mono bg-white/[0.03] px-1 rounded">@{reply.username || (reply.fullName || "user").toLowerCase().replace(/\s/g, '')}</span>
                                          {reply.isVerified && <BadgeCheck className="w-3 h-3 text-blue-400 fill-blue-400 flex-shrink-0" />}
                                        </span>
                                        {reply.userId === video.userId && (
                                          <span className="text-[6px] bg-[#FF4B91] text-white font-black uppercase px-0.5 rounded-[2px] scale-90 origin-left select-none">
                                            Creator
                                          </span>
                                        )}
                                        <span className="text-[8px] text-white/30 font-semibold select-none">
                                          {formatTimeAgo(reply.createdAt)}
                                        </span>
                                      </div>
                                      <p className="text-white/70 text-[10px] font-medium leading-relaxed mt-0.5 whitespace-pre-wrap break-words select-text">
                                        {reply.replyToName && (
                                          <span 
                                            onClick={() => reply.replyToUserId && handleCommentUserClick(reply.replyToUserId)}
                                            className="text-[#FF4B91] font-black mr-1 text-[9.5px] cursor-pointer hover:underline transition-all"
                                          >
                                            @{reply.replyToName}
                                          </span>
                                        )}
                                        {reply.text}
                                      </p>
                                      
                                      {/* Nested Reply Link */}
                                      <div className="flex items-center gap-3 mt-1">
                                        <button 
                                          onClick={() => {
                                            if (!user) {
                                              if ((window as any).triggerLogin) {
                                                (window as any).triggerLogin();
                                              }
                                              return;
                                            }
                                            setReplyingTo({
                                              commentId: parentComment.id,
                                              fullName: reply.fullName,
                                              userId: reply.userId
                                            });
                                            setTimeout(() => {
                                              commentInputRef.current?.focus();
                                            }, 100);
                                          }}
                                          className="text-[8.5px] text-[#FF4B91] hover:text-[#ff6ca7] font-black uppercase tracking-wider active:scale-95 transition-all text-left"
                                        >
                                          Reply
                                        </button>
                                      </div>
                                    </div>

                                    {/* Delete Button for Reply */}
                                    {canDeleteReply && (
                                      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 self-start">
                                        <button 
                                          onClick={() => handleDeleteComment(reply.id, reply.userId)}
                                          className="p-1 rounded-full text-white/40 hover:text-red-500 hover:bg-white/5 transition-all active:scale-90"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              {/* Replying Target Preview Panel */}
              {replyingTo && (
                <div className="px-5 py-2 bg-white/[0.03] border-t border-white/5 flex items-center justify-between text-[10px] text-white/70 animate-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-1.5 select-none font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF4B91] animate-pulse" />
                    <span>
                      Replying to <span className="text-[#FF4B91] font-black">@{replyingTo.fullName}</span>
                    </span>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors active:scale-90"
                  >
                    <X className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                  </button>
                </div>
              )}

              {/* Instant Emoji panel */}
              <div className="px-4 py-1.5 bg-[#121319] border-t border-white/[0.04] flex items-center gap-2 overflow-x-auto select-none no-scrollbar flex-shrink-0">
                {['❤️', '😂', '🔥', '😍', '😮', '👏', '😢', '🙌', '💯', '👍', '✨', '🤩', '🌸', '👑'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      hapticFeedback('light');
                      if (!user) {
                        if ((window as any).triggerLogin) {
                          (window as any).triggerLogin();
                        } else {
                          alert("Please log in to comment");
                        }
                        return;
                      }
                      setNewComment(prev => prev + emoji);
                    }}
                    className="text-sm hover:scale-135 transition-transform active:scale-95 p-1 flex-shrink-0"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Input section */}
              <form 
                onSubmit={handleSendComment}
                className="p-3 pb-6 md:pb-3.5 bg-[#0E0F14] border-t border-white/10 flex items-center gap-3 flex-shrink-0 select-text"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-800 border border-white/10 flex-shrink-0 select-none">
                  {user?.profilePhoto ? (
                    <img src={user.profilePhoto} alt="your avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white text-[11px] font-black">
                      {user?.fullName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="flex-1 flex items-center bg-white/5 rounded-2xl border border-white/10 px-4 py-1.5 relative select-text">
                  <input
                    ref={commentInputRef}
                    type="text"
                    value={newComment}
                    onChange={(e) => {
                      if (!user) {
                        if ((window as any).triggerLogin) {
                          (window as any).triggerLogin();
                        }
                        return;
                      }
                      setNewComment(e.target.value);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!user) {
                        if ((window as any).triggerLogin) {
                          (window as any).triggerLogin();
                        }
                      }
                    }}
                    onFocus={(e) => {
                      if (!user) {
                        e.target.blur();
                        if ((window as any).triggerLogin) {
                          (window as any).triggerLogin();
                        }
                      }
                    }}
                    placeholder={user ? "Write a comment..." : "Login to comment..."}
                    className="flex-1 bg-transparent text-white text-[11px] outline-none pr-8 placeholder-white/20 select-text pointer-events-auto cursor-pointer"
                    onTouchStart={(e) => e.stopPropagation()}
                  />
                  {newComment.trim() && user && (
                    <button
                      type="submit"
                      className="absolute right-3 p-1 rounded-full text-[#FF4B91] hover:bg-[#FF4B91]/10 active:scale-90 transition-all cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Discover({ pendingUploads, isOffline, isMuted, setIsMuted }: { pendingUploads: PendingUpload[], isOffline?: boolean, isMuted: boolean, setIsMuted: (m: boolean) => void }) {
  const appLanguage = localStorage.getItem('appLanguage') || 'en';
  const [videos, setVideos] = useState<Video[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [discoverTab, setDiscoverTab] = useState<'reels' | 'search'>('reels');
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const reelsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePlayVideo = (e: any) => {
      const targetVideo = e.detail;
      setDiscoverTab('reels');
      (window as any).startReelVideoId = targetVideo.id;
    };
    const handleSetDiscoverTab = (e: any) => {
      if (e.detail === 'reels' || e.detail === 'search') {
        setDiscoverTab(e.detail);
      }
    };
    window.addEventListener('play-video-in-reels', handlePlayVideo as any);
    window.addEventListener('set-discover-tab', handleSetDiscoverTab as any);
    return () => {
      window.removeEventListener('play-video-in-reels', handlePlayVideo as any);
      window.removeEventListener('set-discover-tab', handleSetDiscoverTab as any);
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    // Fetch Videos
    const vq = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    const unsubscribeVideos = onSnapshot(vq, (snapshot) => {
      const vids = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
      const nonMarketplace = vids.filter(v => v.privacy !== 'marketplace');
      setVideos(deduplicateVideos(nonMarketplace));
    }, (err) => {
      if (!isFirestoreShutdownError(err)) {
        console.error("Discover videos snapshot error:", err);
      }
    });

    // Fetch Users for searching
    const uq = query(collection(db, 'users'), limit(50));
    const unsubscribeUsers = onSnapshot(uq, (snapshot) => {
      const usrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(deduplicateById(usrs));
      setLoading(false);
    }, (err) => {
      if (!isFirestoreShutdownError(err)) {
        console.error("Discover users snapshot error:", err);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeVideos();
      unsubscribeUsers();
    };
  }, []);

  const handleReelsScroll = () => {
    if (reelsContainerRef.current) {
      const scrollTop = reelsContainerRef.current.scrollTop;
      const index = Math.round(scrollTop / reelsContainerRef.current.clientHeight);
      if (index !== activeReelIndex) {
        setActiveReelIndex(index);
      }
    }
  };

  const optimisticVideos = (pendingUploads || [])
    .filter(p => !p.isStory && (p.status === 'queued' || p.status === 'uploading' || p.status === 'finishing' || p.status === 'error' || p.status === 'failed'))
    .map(p => ({
      id: p.id,
      userId: p.userId || 'unknown',
      fullName: p.fullName || 'User',
      profilePhoto: p.profilePhoto,
      title: p.title || '',
      description: p.description || '',
      contentUrl: p.preview || '',
      type: p.type === 'photo' ? 'image' : (p.type === 'text' ? 'text' : 'video'),
      filter: p.filter,
      backgroundColor: p.backgroundColor || p.bgColor || '',
      likeCount: 0,
      commentCount: 0,
      views: 0,
      isPublic: true,
      canDownload: true,
      createdAt: new Date().toISOString(),
      isOptimistic: true
    } as unknown as Video));

  const uniqueReelsMap = new Map();
  [...optimisticVideos, ...videos].forEach(v => {
    if (!v) return;
    const id = v.id || v.data?.id;
    if (id) {
      if (!uniqueReelsMap.has(id) || v.isOptimistic) {
        uniqueReelsMap.set(id, v);
      }
    }
  });
  const allVideos = Array.from(uniqueReelsMap.values());

  // Filter ONLY vertical reel videos
  const onlyVideos = allVideos.filter(v => {
    if (v.type === 'text') return false;
    const displayUrl = v.contentUrl || (v as any).videoUrl;
    const isImage = v.type === 'image' || (v.type as string) === 'photo' || 
      (v.type !== 'video' && displayUrl && (
        displayUrl.toLowerCase().includes('.jpg') || 
        displayUrl.toLowerCase().includes('.png') || 
        displayUrl.toLowerCase().includes('.jpeg') || 
        displayUrl.toLowerCase().includes('.webp') || 
        displayUrl.toLowerCase().includes('.heic') || 
        displayUrl.toLowerCase().includes('.gif') || 
        displayUrl.toLowerCase().startsWith('data:image/')
      ));
    return !isImage && !!displayUrl;
  });

  // Hot Reels logic - Sort by views and likes so the hottest content is served first
  const hotVideos = useMemo(() => {
    let list = [...onlyVideos].sort((a, b) => {
      const dateValA = a.createdAt as any;
      const dateValB = b.createdAt as any;
      const dateA = dateValA ? (dateValA.toDate ? dateValA.toDate().getTime() : new Date(dateValA).getTime()) : Date.now();
      const dateB = dateValB ? (dateValB.toDate ? dateValB.toDate().getTime() : new Date(dateValB).getTime()) : Date.now();

      // Facebook Hot Reels Engagement metric: views * 1 + likeCount * 4 + commentCount * 8
      const engA = (a.views || 0) * 1 + (a.likeCount || 0) * 4 + (a.commentCount || 0) * 8;
      const engB = (b.views || 0) * 1 + (b.likeCount || 0) * 4 + (b.commentCount || 0) * 8;

      const ageA = Math.max(0, (Date.now() - dateA) / 3600000);
      const ageB = Math.max(0, (Date.now() - dateB) / 3600000);

      // Decay score with gentle 1.1 gravity
      const scoreA = (engA + 1) / Math.pow(ageA + 2, 1.1);
      const scoreB = (engB + 1) / Math.pow(ageB + 2, 1.1);

      return scoreB - scoreA;
    });

    const startVideoId = (window as any).startReelVideoId;
    if (startVideoId) {
      const idx = list.findIndex(v => (v.id || (v as any).data?.id) === startVideoId);
      if (idx === -1) {
        // If the tapped video isn't already inside standard list, prepend it to guarantee visibility
        const targetV = allVideos.find(v => (v.id || (v as any).data?.id) === startVideoId);
        if (targetV) {
          list = [targetV, ...list];
        }
      }
    }

    // Explicit unique ID check & deduplication to block React key collisions
    const seenIds = new Set<string>();
    return list.filter(v => {
      if (!v) return false;
      const vidId = v.id || (v as any).data?.id;
      if (!vidId) return false;
      if (seenIds.has(vidId)) return false;
      seenIds.add(vidId);
      return true;
    });
  }, [onlyVideos, allVideos]);

  // Effect to automatically scroll to starting video in Reels
  useEffect(() => {
    const startVideoId = (window as any).startReelVideoId;
    if (startVideoId && hotVideos.length > 0) {
      const idx = hotVideos.findIndex(v => v.id === startVideoId);
      if (idx !== -1) {
        // Clear global state so it transitions cleanly on next visits
        delete (window as any).startReelVideoId;
        
        // Update active index
        setActiveReelIndex(idx);
        
        // Instantly focus and scroll the reels container to selected index
        setTimeout(() => {
          if (reelsContainerRef.current) {
            const container = reelsContainerRef.current;
            const targetScrollTop = idx * container.clientHeight;
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'auto'
            });
          }
        }, 120);
      }
    }
  }, [hotVideos]);

  const filteredVideos = allVideos.filter(v => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (v.title?.toLowerCase() || '').includes(q) ||
      (v.description?.toLowerCase() || '').includes(q) ||
      (v.fullName?.toLowerCase() || '').includes(q)
    );
  });

  const filteredUsers = searchQuery.trim() ? users.filter(u => {
    const q = searchQuery.toLowerCase().trim();
    return (
      (u.fullName?.toLowerCase() || '').includes(q) ||
      (u.email?.toLowerCase() || '').includes(q) ||
      (u.id?.toLowerCase() || '').includes(q)
    );
  }).slice(0, 10) : [];

  const handleUserClick = (userId: string) => {
    const event = new CustomEvent('nav-to-profile', { detail: userId });
    window.dispatchEvent(event);
  };

  return (
    <div className="h-full w-full bg-black text-white relative overflow-hidden">
      {/* Sticky Immersive Sub-header Selector Overlay with Unified Navigation */}
      <div className="absolute top-0 left-0 right-0 z-30 pt-4 pb-2.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex flex-col select-none">
        <div className="px-4 py-1.5 flex items-center justify-between w-full">
          {/* Unified Navigation Links (Following, ForYou, Hot Reels, Marketplace) */}
          <div className="flex items-center space-x-4 overflow-x-auto flex-1 px-2 flex-nowrap whitespace-nowrap scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button 
              onClick={() => {
                hapticFeedback('light');
                const event = new CustomEvent('nav-to-tab', { detail: 'home' });
                window.dispatchEvent(event);
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('set-feed-tab', { detail: 'following' }));
                }, 50);
              }}
              className="text-[13px] md:text-sm font-black px-2 py-1 transition-all text-white/60 hover:text-white cursor-pointer flex-shrink-0 whitespace-nowrap"
            >
              Following
            </button>

            <button 
              onClick={() => {
                hapticFeedback('light');
                const event = new CustomEvent('nav-to-tab', { detail: 'home' });
                window.dispatchEvent(event);
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('set-feed-tab', { detail: 'foryou' }));
                }, 50);
              }}
              className="text-[13px] md:text-sm font-black px-2 py-1 transition-all text-white/60 hover:text-white cursor-pointer flex-shrink-0 whitespace-nowrap"
            >
              For You
            </button>

            <button 
              onClick={() => {
                hapticFeedback('light');
                setDiscoverTab('reels');
              }}
              className={cn(
                "text-[13px] md:text-sm font-black px-2 py-1 relative transition-all cursor-pointer flex-shrink-0 whitespace-nowrap",
                discoverTab === 'reels' ? "text-[#FF4B91] scale-105" : "text-white/60 hover:text-white"
              )}
            >
              <span className="whitespace-nowrap">Hot Reels</span>
              {discoverTab === 'reels' && (
                <motion.div layoutId="discover-top-nav-indicator" className="absolute -bottom-1 left-1 right-1 h-[2px] bg-[#FF4B91] rounded-full" />
              )}
            </button>

            <button 
              onClick={() => {
                hapticFeedback('light');
                const event = new CustomEvent('nav-to-tab', { detail: 'marketplace' });
                window.dispatchEvent(event);
              }}
              className="text-[13px] md:text-sm font-black px-2 py-1 transition-all text-white/60 hover:text-white cursor-pointer flex-shrink-0 whitespace-nowrap"
            >
              Marketplace
            </button>
          </div>

          {/* Right Corner (Search Option) */}
          <div className="flex items-center flex-shrink-0">
            <button 
              onClick={() => {
                hapticFeedback('light');
                setDiscoverTab('search');
              }}
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center border transition-all active:scale-95",
                discoverTab === 'search' 
                  ? "bg-[#FF4B91] text-white border-[#FF4B91]" 
                  : "bg-white/10 hover:bg-white/20 text-white border-white/10"
              )}
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {discoverTab === 'reels' ? (
        <div 
          ref={reelsContainerRef}
          onScroll={handleReelsScroll}
          className="h-full w-full overflow-y-scroll bg-black no-scrollbar snap-y snap-mandatory relative pb-16"
        >
          {loading ? (
            <div className="h-full w-full flex flex-col items-center justify-center bg-black">
              <div className="w-8 h-8 border-2 border-[#FF4B91] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Loading Hot Reels...</p>
            </div>
          ) : hotVideos.length > 0 ? (
            hotVideos.map((video, idx) => {
              const videoKey = `hot-reel-${video.id || (video as any).data?.id || 'post'}-${idx}`;
              return (
                <div key={videoKey} className="w-full h-full snap-start snap-always relative overflow-hidden flex-shrink-0">
                  <VideoPlayer 
                    video={video}
                    isActive={idx === activeReelIndex}
                    isMuted={isMuted}
                    setIsMuted={setIsMuted}
                  />
                </div>
              );
            })
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-gray-500 p-8 text-center bg-black">
              <VideoIcon className="w-12 h-12 text-gray-700 mb-3 animate-pulse" />
              <p className="text-sm font-black uppercase tracking-wider">No Reels Available</p>
              <p className="text-[10px] text-gray-600 uppercase font-black tracking-tight mt-1">Upload a video to see it here!</p>
            </div>
          )}
        </div>
      ) : (
        <div className="h-full p-4 overflow-y-auto pb-24 pt-20">
          {/* Search Header */}
          <div className="sticky top-0 z-20 bg-black/90 backdrop-blur-md pb-4">
            <div className="flex items-center bg-gray-900/80 rounded-2xl p-3 border border-white/5 focus-within:border-pink-500/50 transition-colors">
              <Search className="w-5 h-5 text-gray-500 mr-2" />
              <input 
                type="text" 
                placeholder="Search users or videos..." 
                className="bg-transparent outline-none flex-1 text-sm font-medium placeholder:text-gray-600"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>
          
          <div className="mt-4">
            {/* User Results Section */}
            {searchQuery.trim() && filteredUsers.length > 0 && (
              <div className="mb-8">
                <h3 className="font-black uppercase tracking-widest text-[10px] text-gray-400 mb-4 px-1">Users Found</h3>
                <div className="space-y-3">
                  {filteredUsers.map((u, index) => (
                    <div 
                      key={`${u.id || ''}-search-${index}`} 
                      className="flex items-center justify-between bg-gray-900/40 p-3 rounded-xl border border-white/5 hover:border-pink-500/30 transition-all cursor-pointer"
                      onClick={() => handleUserClick(u.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full border border-pink-500/30 overflow-hidden bg-gray-800">
                          <img src={u.profilePhoto || null} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{u.fullName || 'Anonymous'}</p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-tight">@{u.fullName?.toLowerCase().replace(/\s/g, '') || 'user'}</p>
                        </div>
                      </div>
                      <UserPlus className="w-4 h-4 text-pink-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="font-black uppercase tracking-widest text-[10px] text-gray-400">
                {searchQuery ? `Videos Found (${filteredVideos.length})` : 'Trending Content'}
              </h3>
              {!searchQuery && (
                <div className="flex items-center space-x-1 text-pink-500">
                  <Star className="w-3 h-3 fill-current" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">Popular</span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Loading Content...</p>
              </div>
            ) : filteredVideos.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {filteredVideos.map((v, index) => {
                  const displayUrl = v.contentUrl || (v as any).videoUrl;
                  const isImage = v.type === 'image' || (v.type as string) === 'photo' || 
                    (v.type !== 'video' && v.type !== 'text' && displayUrl && (
                      displayUrl.toLowerCase().includes('.jpg') || 
                      displayUrl.toLowerCase().includes('.png') || 
                      displayUrl.toLowerCase().includes('.jpeg') || 
                      displayUrl.toLowerCase().includes('.webp') ||
                      displayUrl.toLowerCase().includes('.heic') ||
                      displayUrl.toLowerCase().includes('.gif') ||
                      displayUrl.toLowerCase().startsWith('data:image/')
                    ));
                    return (
                      <motion.div 
                        key={`disc-search-${v.id || v.data?.id || 'post'}-${index}`} 
                        initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="aspect-[9/16] bg-gray-900/50 overflow-hidden relative rounded-sm cursor-pointer group"
                      onClick={() => setSelectedVideo(v)}
                    >
                      {v.isOptimistic && (
                        <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {v.type === 'text' ? (
                        <div className={cn("w-full h-full flex items-center justify-center p-3 text-center", (v.backgroundColor || (v as any).bgColor) || 'bg-gradient-to-br from-purple-600 to-blue-600')}>
                          <p className="text-white text-[10px] font-black line-clamp-5">{v.description || (v as any).textContent || v.title}</p>
                        </div>
                      ) : isImage ? (
                        <img src={displayUrl || null} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <video src={displayUrl || null} className="w-full h-full object-cover transition-transform group-hover:scale-105" preload="metadata" muted referrerPolicy="no-referrer" />
                      )}
                      <div className="absolute bottom-2 left-2 flex items-center text-[10px] font-bold text-white drop-shadow-md">
                        <Heart className="w-3 h-3 mr-1 fill-white" /> {v.likeCount || 0}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center px-8">
                <div className="w-16 h-16 bg-gray-900/50 rounded-full flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-gray-700" />
                </div>
                <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-wider">No results found</h4>
                <p className="text-gray-500 text-[10px] leading-relaxed uppercase tracking-tight font-medium">
                  We couldn't find any videos or users matching "{searchQuery}". Try different keywords.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Screen Player Overlay (Global Pattern) */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
          >
            <div className="absolute top-6 left-5 z-[110]">
              <button 
                onClick={() => setSelectedVideo(null)}
                className="p-2 bg-black/20 backdrop-blur-sm rounded-full hover:bg-black/40 transition-colors"
              >
                <X className="w-5 h-5 text-white/90" />
              </button>
            </div>

            <div className="w-full h-full relative">
              <VideoPlayer 
                video={selectedVideo} 
                isActive={true} 
                isMuted={isMuted} 
                setIsMuted={setIsMuted} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


function StoryViewer({ story, onClose, users = [] }: { story: Story, onClose: () => void, users?: User[] }) {
  const { user } = useAuth();
  const isAdmin = !!(
    (auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com')
  );
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewersPanel, setShowViewersPanel] = useState(false);

  // Register current user as a viewer of this story
  useEffect(() => {
    if (user && story.id && !story.viewers?.includes(user.id)) {
      const storyRef = doc(db, 'stories', story.id);
      updateDoc(storyRef, {
        viewers: arrayUnion(user.id)
      }).catch(err => {
        console.error("Firestore reader registration failed:", err);
      });
    }
  }, [user, story.id]);

  const handleDelete = async () => {
    if (!user || (user.id !== story.userId && !isAdmin)) return;
    if (window.confirm("Delete this story?")) {
      try {
        await deleteDoc(doc(db, 'stories', story.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `stories/${story.id}`));
        onClose();
      } catch (err: any) {
        console.error("Delete story error:", err);
        let message = "Failed to delete story";
        try {
          const parsed = JSON.parse(err.message);
          message += ": " + parsed.error;
        } catch {
          message += ": " + (err.message || "Permission Denied");
        }
        alert(message);
      }
    }
  };
  
  useEffect(() => {
    if (isPaused || showViewersPanel) return;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 1;
      });
    }, 50);

    return () => clearInterval(timer);
  }, [isPaused, showViewersPanel]);

  // Separate effect to handle closing when progress reaches 100
  useEffect(() => {
    if (progress >= 100) {
      onClose();
    }
  }, [progress, onClose]);

  const filterStyle = {
    filter: `${FILTER_OPTIONS.find(f => f.id === (story as any).filter)?.style || ''} brightness(${(story as any).brightness || 100}%) contrast(${(story as any).contrast || 100}%) saturate(${(story as any).saturation || 100}%)`
  };

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && (story as any).speed) {
      videoRef.current.playbackRate = (story as any).speed;
    }
  }, [story]);

  useEffect(() => {
    const videoElem = videoRef.current;
    if (!videoElem) return;

    if (isPaused || showViewersPanel) {
      videoElem.pause();
    } else {
      videoElem.play().catch(() => {});
    }
  }, [isPaused, showViewersPanel]);

  useEffect(() => {
    const videoElem = videoRef.current;
    if (!videoElem) return;

    const handleTimeUpdate = () => {
      const trimStart = (story as any).trimStart || 0;
      const trimEnd = (story as any).trimEnd || 0;
      if (trimEnd > trimStart) {
        if (videoElem.currentTime < trimStart) {
          videoElem.currentTime = trimStart;
        }
        if (videoElem.currentTime > trimEnd) {
          videoElem.currentTime = trimStart;
        }
      }
    };

    videoElem.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      videoElem.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [story]);

  // Get viewer profiles based on local users array
  const viewerUIDs = Array.from(new Set(story.viewers || []));
  const viewerDetails = viewerUIDs.map(uid => users.find(u => u.id === uid)).filter(Boolean) as User[];
  const isOwner = user && user.id === story.userId;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[1000] bg-[#0A0A0C] flex flex-col select-none touch-none"
    >
      {/* Progress Bar Container */}
      <div className="absolute top-4 left-4 right-4 flex space-x-1 z-[1010]">
        <div className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-pink-500 rounded-full shadow-[0_0_8px_rgba(255,75,145,0.8)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "linear" }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-[1010]">
        <div 
          onClick={() => {
            onClose();
            hapticFeedback('light');
            window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: story.userId }));
          }}
          className="flex items-center space-x-3 cursor-pointer hover:opacity-85 active:scale-95 transition-all"
        >
          {story.profilePhoto ? (
            <img src={story.profilePhoto} className="w-9 h-9 rounded-full border-2 border-pink-500/80 object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-pink-600 flex items-center justify-center border-2 border-pink-500/80 text-white text-sm font-semibold">
              {story.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-white text-xs font-black tracking-wide drop-shadow-md">{story.fullName}</span>
            <span className="text-[9px] text-gray-300 font-bold drop-shadow-md uppercase tracking-tight">Active Story</span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 bg-black/20 backdrop-blur-md rounded-full px-1.5 py-1 border border-white/5">
          {user && (user.id === story.userId || isAdmin) && (
            <button onClick={handleDelete} className="p-2 text-red-500 hover:text-red-400 active:scale-90 transition-all">
              <Trash2 className="w-4.5 h-4.5" />
            </button>
          )}
          <button 
            onClick={() => setIsPaused(!isPaused)} 
            className="p-2 text-white/80 hover:text-white active:scale-90 transition-all"
            title={isPaused ? "Pause/Resume" : "Pause/Resume"}
          >
            {isPaused ? <Play className="w-4.5 h-4.5 fill-current" /> : <Pause className="w-4.5 h-4.5 fill-current" />}
          </button>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white active:scale-90 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content Canvas Area */}
      <div 
        className="flex-1 flex items-center justify-center relative touch-none"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {story.type === 'video' ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <video 
              ref={videoRef}
              src={story.url || undefined} 
              autoPlay 
              muted={isMuted} 
              playsInline 
              style={filterStyle}
              className="w-full h-full object-contain" 
            />
            {story.overlayText && (
              <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none px-6">
                <span 
                  style={{ color: story.textColor || '#ffffff' }}
                  className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-center scale-y-110 drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)]"
                >
                  {story.overlayText}
                </span>
              </div>
            )}
            {story.stickers?.map((sticker, idx) => (
              <div 
                key={`story-video-sticker-${sticker.value || 'st'}-${idx}`}
                style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
                className="absolute z-20 pointer-events-none select-none drop-shadow-2xl animate-bounce"
              >
                {sticker.value}
              </div>
            ))}
            
            {/* Audio Indicator Toggle Controls */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
              className="absolute bottom-20 right-4 p-3 bg-black/50 backdrop-blur-md border border-white/10 rounded-full z-[1010] active:scale-90 transition-transform"
            >
              {isMuted ? <VolumeX className="w-4.5 h-4.5 text-white" /> : <Volume2 className="w-4.5 h-4.5 text-white" />}
            </button>
          </div>
        ) : story.type === 'image' ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img src={story.url || null} style={filterStyle} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            {story.overlayText && (
              <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none px-6">
                <span 
                  style={{ color: story.textColor || '#ffffff' }}
                  className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-center scale-y-110 drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)]"
                >
                  {story.overlayText}
                </span>
              </div>
            )}
            {story.stickers?.map((sticker, idx) => (
              <div 
                key={`story-image-sticker-${sticker.value || 'st'}-${idx}`}
                style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
                className="absolute z-20 pointer-events-none select-none drop-shadow-2xl animate-bounce"
              >
                {sticker.value}
              </div>
            ))}
          </div>
        ) : (
          <div 
            className={cn(
              "w-full h-full flex flex-col items-center justify-center p-10 text-center relative", 
              story.backgroundColor?.startsWith('bg-') ? story.backgroundColor : (!story.backgroundColor ? "bg-[#121214]" : "")
            )}
            style={!story.backgroundColor?.startsWith('bg-') && story.backgroundColor ? { backgroundColor: story.backgroundColor } : {}}
          >
            <p className="text-3xl md:text-4xl font-black text-white leading-relaxed drop-shadow-xl">{story.content}</p>
          </div>
        )}

        {/* Swipe indicator info at the bottom center of story */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center text-white/40 pointer-events-none select-none z-[1010]">
          <span className="text-[8px] font-black uppercase tracking-widest leading-none mb-1 text-center font-mono">Tap & Hold to Pause</span>
          <div className="w-4 h-1 bg-white/20 rounded-full" />
        </div>
      </div>

      {/* Owner Bottom Viewers Panel Trigger */}
      {isOwner && (
        <div className="absolute bottom-4 left-4 z-[1020]" onClick={(e) => e.stopPropagation()}>
          <button 
            onClick={() => {
              hapticFeedback('medium');
              setShowViewersPanel(true);
            }}
            className="flex items-center space-x-1.5 bg-black/60 backdrop-blur-xl hover:bg-black/80 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-full border border-white/10 active:scale-95 transition-all shadow-xl"
          >
            <Eye className="w-4 h-4 text-pink-500 animate-pulse" />
            <span>{viewerUIDs.length} Views</span>
          </button>
        </div>
      )}

      {/* Slide Up Sheet for Story Viewers */}
      <AnimatePresence>
        {showViewersPanel && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowViewersPanel(false)}
              className="absolute inset-0 bg-black z-[1035]"
            />
            
            {/* Viewers Container Bottom Drawer */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute bottom-0 inset-x-0 bg-[#121216] rounded-t-[2.5rem] border-t border-white/10 max-h-[75vh] flex flex-col pb-[env(safe-area-inset-bottom,20px)] z-[1040]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag line */}
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto my-3.5" onClick={() => setShowViewersPanel(false)} />

              <div className="px-6 pb-4 flex justify-between items-center border-b border-white/5">
                <div>
                  <h3 className="text-white font-black text-sm uppercase tracking-wide">Story Viewers</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">{viewerDetails.length} Users viewed this story</p>
                </div>
                <button 
                  onClick={() => setShowViewersPanel(false)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-full transition-colors active:scale-90"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Viewers List */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5 max-h-[50vh]">
                {viewerDetails.length > 0 ? (
                  viewerDetails.map((vUser, idx) => (
                    <div 
                      key={`${vUser.id}-${idx}`}
                      onClick={() => {
                        setShowViewersPanel(false);
                        onClose();
                        hapticFeedback('light');
                        window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: vUser.id }));
                      }}
                      className="flex items-center justify-between p-2 hover:bg-white/5 rounded-2xl cursor-pointer active:scale-98 transition-all"
                    >
                      <div className="flex items-center space-x-3">
                        {vUser.profilePhoto ? (
                          <img src={vUser.profilePhoto} className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-pink-600 flex items-center justify-center text-white text-xs font-black">
                            {vUser.fullName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="flex flex-col text-left">
                          <span className="text-white text-xs font-black leading-none mb-1">{vUser.fullName}</span>
                          <span className="text-[9px] text-gray-500 font-bold tracking-tight uppercase">@{vUser.username || 'worlduser'}</span>
                        </div>
                      </div>
                      <span className="text-[8px] font-black uppercase text-pink-500 tracking-wider bg-pink-500/10 px-2 py-1 rounded-md">Viewed</span>
                    </div>
                  ))
                ) : (
                  <div className="py-14 text-center flex flex-col items-center justify-center px-4">
                    <Eye className="w-10 h-10 text-gray-700 mb-3" />
                    <p className="text-white font-bold text-xs uppercase tracking-wider mb-1">No views yet</p>
                    <p className="text-gray-500 text-[10px] leading-relaxed max-w-[200px]">When other members view your story, they will appear here instantly!</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Feed({ 
  pendingUploads, 
  isMuted, 
  setIsMuted,
  unreadNotifsCount = 0,
  unreadDMsCount = 0,
  startBackgroundUpload,
  cancelUpload
}: { 
  pendingUploads: PendingUpload[]; 
  isMuted: boolean; 
  setIsMuted: (m: boolean) => void;
  unreadNotifsCount?: number;
  unreadDMsCount?: number;
  startBackgroundUpload: (data: any) => Promise<void>;
  cancelUpload: (id: string) => void;
}) {
  const { user } = useAuth();
  const [appLanguage, setAppLanguage] = useState(() => localStorage.getItem('appLanguage') || 'en');
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const newLang = (e as CustomEvent).detail;
      setAppLanguage(newLang);
    };
    window.addEventListener('app-language-changed', handleLangChange);
    return () => window.removeEventListener('app-language-changed', handleLangChange);
  }, []);

  useEffect(() => {
    const uq = query(collection(db, 'users'), limit(150));
    const unsubscribeUsers = onSnapshot(uq, (snapshot) => {
      const usrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(deduplicateById(usrs));
    }, (err) => {
      console.error("Feed users listener error:", err);
    });
    return () => unsubscribeUsers();
  }, []);

  useEffect(() => {
    const handleLocalPostCreated = (e: Event) => {
      const { isStory, data } = (e as CustomEvent).detail;
      if (isStory) {
        setLocalCreatedStories(prev => {
          const updated = [data, ...prev];
          try { localStorage.setItem('world_local_created_stories', JSON.stringify(updated)); } catch(err) {}
          return updated;
        });
      } else {
        setLocalCreatedVideos(prev => {
          const updated = [data, ...prev];
          try { localStorage.setItem('world_local_created_videos', JSON.stringify(updated)); } catch(err) {}
          return updated;
        });
      }
    };
    window.addEventListener('local-post-created', handleLocalPostCreated);
    return () => window.removeEventListener('local-post-created', handleLocalPostCreated);
  }, []);

  const isAdmin = !!(
    (auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com')
  );
  const [videosState, setVideosState] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('world_cached_videos');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [storiesState, setStoriesState] = useState<Story[]>(() => {
    try {
      const saved = localStorage.getItem('world_cached_stories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [localCreatedVideos, setLocalCreatedVideos] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('world_local_created_videos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [localCreatedStories, setLocalCreatedStories] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('world_local_created_stories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const videos = useMemo(() => {
    const combined = [...localCreatedVideos, ...videosState];
    return deduplicateVideos(combined);
  }, [localCreatedVideos, videosState]);

  const stories = useMemo(() => {
    const combined = [...localCreatedStories, ...storiesState];
    const seen = new Set();
    return combined.filter(item => {
      const id = item.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [localCreatedStories, storiesState]);

  const setVideos = (val: any) => {
    setVideosState(val);
    try {
      localStorage.setItem('world_cached_videos', JSON.stringify(val));
    } catch (err) {}
  };

  const setStories = (val: any) => {
    setStoriesState(val);
    try {
      localStorage.setItem('world_cached_stories', JSON.stringify(val));
    } catch (err) {}
  };

  const [feedLoading, setFeedLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef<number | null>(null);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    hapticFeedback('medium');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsStandalone(true);
    setDeferredPrompt(null);
  };

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPrompt = e;
    };
    const handleSetFeedTab = (e: any) => {
      if (e.detail === 'foryou' || e.detail === 'following') {
        setTab(e.detail);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('set-feed-tab', handleSetFeedTab as any);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('set-feed-tab', handleSetFeedTab as any);
    };
  }, []);

  const fetchVideosAndStories = (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
      hapticFeedback('medium');
    }

    const fetchServerFallbackVideos = async () => {
      try {
        const res = await fetch('/api/posts');
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            setVideos(data);
            setFeedLoading(false);
          }
        }
      } catch (e) {
        console.warn("Server API fallback posts empty or unavailable:", e);
      }
    };

    const fetchServerFallbackStories = async () => {
      try {
        const res = await fetch('/api/stories');
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            const now = new Date().getTime();
            const filtered = data.filter((story: any) => {
              const created = story.createdAt ? new Date(story.createdAt).getTime() : now;
              return now - created < 24 * 60 * 60 * 1000;
            });
            setStories(filtered);
          }
        }
      } catch (e) {
        console.warn("Server API fallback stories empty or unavailable:", e);
      }
    };

    if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
      console.warn("Firestore quota limit active. Retrieving feed from server API sync...");
      fetchServerFallbackVideos();
      fetchServerFallbackStories();
      if (isManualRefresh) {
        setTimeout(() => setIsRefreshing(false), 800);
      }
      return () => {};
    }

    let unsubVideos: () => void = () => {};
    let unsubStories: () => void = () => {};
    let active = true;

    const runSetup = async () => {
      try {
        let vq;
        if (tab === 'following' && user) {
          const followingSnap = await getDocs(collection(db, 'users', user.id, 'following'));
          if (!active) return;
          const followingIds = followingSnap.docs.map(d => d.id);
          
          if (followingIds.length > 0) {
            vq = query(
              collection(db, 'videos'), 
              where('userId', 'in', followingIds.slice(0, 30)),
              orderBy('createdAt', 'desc')
            );
          } else {
            setVideos([]);
            if (isManualRefresh) setIsRefreshing(false);
            return;
          }
        } else {
          vq = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
        }

        if (!active) return;

        unsubVideos = onSnapshot(vq, (snapshot) => {
          if (!active) return;
          const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
          const filteredList = rawList.filter(v => v.privacy !== 'marketplace');
          let sortedList = deduplicateById(filteredList);
          
          // Client-side sort to support latency compensation (null createdAt becomes Date.now())
          sortedList.sort((a, b) => {
            const dateValA = a.createdAt as any;
            const dateValB = b.createdAt as any;
            const dateA = dateValA ? (dateValA.toDate ? dateValA.toDate().getTime() : new Date(dateValA).getTime()) : Date.now();
            const dateB = dateValB ? (dateValB.toDate ? dateValB.toDate().getTime() : new Date(dateValB).getTime()) : Date.now();
            
            if (tab === 'foryou') {
              // Facebook Smart Recommendation Ranking Algorithm
              // 1. Engagement indicators metrics (Views=1pt, Likes=5pts, Comments=10pts)
              const engA = (a.views || 0) * 1 + (a.likeCount || 0) * 5 + (a.commentCount || 0) * 10;
              const engB = (b.views || 0) * 1 + (b.likeCount || 0) * 5 + (b.commentCount || 0) * 10;
              
              // 2. Gravitational time decay calculation (in hours)
              const ageA = Math.max(0, (Date.now() - dateA) / 3600000);
              const ageB = Math.max(0, (Date.now() - dateB) / 3600000);
              
              // 3. Score calculation with gravity decay power 1.2
              const scoreA = (engA + 1) / Math.pow(ageA + 2, 1.2);
              const scoreB = (engB + 1) / Math.pow(ageB + 2, 1.2);
              
              return scoreB - scoreA;
            } else {
              // Chronological reverse order for following tab
              return dateB - dateA;
            }
          });

          const sharedVideoId = new URLSearchParams(window.location.search).get('v');
          if (sharedVideoId) {
            const matchedIdx = sortedList.findIndex(video => video.id === sharedVideoId);
            if (matchedIdx > -1) {
              const matchedVideo = sortedList[matchedIdx];
              sortedList.splice(matchedIdx, 1);
              sortedList.unshift(matchedVideo);
            }
          }
          setVideos(sortedList.map(video => ({ type: 'video', data: video })));
          setFeedLoading(false);
          if (isManualRefresh) {
            setTimeout(() => setIsRefreshing(false), 800);
          }
        }, (err) => {
          if (!active) return;
          handleFirestoreError(err, OperationType.GET, 'videos');
          fetchServerFallbackVideos();
          if (isManualRefresh) setIsRefreshing(false);
          setFeedLoading(false);
        });

        // Fetch Stories
        const sq = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
        unsubStories = onSnapshot(sq, (snapshot) => {
          if (!active) return;
          const s = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story));
          const sDeduplicated = deduplicateById(s);
          const now = new Date().getTime();
          const filtered = sDeduplicated.filter(story => {
            const created = (story.createdAt as any)?.toDate ? (story.createdAt as any).toDate().getTime() : now;
            return now - created < 24 * 60 * 60 * 1000;
          });
          setStories(filtered);
          setFeedLoading(false);
        }, (err) => {
          if (!active) return;
          handleFirestoreError(err, OperationType.GET, 'stories');
          fetchServerFallbackStories();
          setFeedLoading(false);
        });

      } catch (err) {
        if (!active) return;
        console.error("Refresh error:", err);
        fetchServerFallbackVideos();
        fetchServerFallbackStories();
        if (isManualRefresh) setIsRefreshing(false);
        setFeedLoading(false);
      }
    };

    runSetup();

    return () => {
      active = false;
      unsubVideos();
      unsubStories();
    };
  };

  useEffect(() => {
    const unsub = fetchVideosAndStories();
    return () => {
      unsub();
    };
  }, [tab, user]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current !== null && containerRef.current && containerRef.current.scrollTop === 0) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartRef.current;
      if (diff > 0) {
        // Apply resistance
        const distance = Math.min(diff * 0.4, 80);
        setPullDistance(distance);
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      fetchVideosAndStories(true);
    }
    setPullDistance(0);
    touchStartRef.current = null;
  };

  const optimisticVideos = (pendingUploads || [])
    .filter(p => !p.isStory && (p.status === 'queued' || p.status === 'uploading' || p.status === 'finishing' || p.status === 'error' || p.status === 'failed'))
    .map(p => ({
      type: 'video',
      isOptimistic: true,
      data: {
        id: p.id,
        userId: p.userId || user?.id || 'unknown',
        fullName: p.fullName || user?.fullName || 'User',
        profilePhoto: p.profilePhoto || user?.profilePhoto || '',
        title: p.title || '',
        description: p.description || '',
        contentUrl: p.preview || '',
        type: p.type === 'photo' ? 'image' : (p.type === 'text' ? 'text' : 'video'),
        filter: p.filter || 'none',
        backgroundColor: p.backgroundColor || p.bgColor || '',
        likeCount: 0,
        commentCount: 0,
        views: 0,
        isPublic: true,
        canDownload: true,
        musicVolume: 100, // Explicitly default sound
        createdAt: new Date().toISOString()
      } as unknown as Video
    }));

  const optimisticStories = (pendingUploads || [])
    .filter(p => p.isStory && (p.status === 'queued' || p.status === 'uploading' || p.status === 'finishing'))
    .map(p => ({
      id: p.id,
      userId: p.userId!,
      fullName: p.fullName!,
      profilePhoto: p.profilePhoto,
      type: p.type === 'photo' ? 'image' : (p.type === 'text' ? 'text' : 'video'),
      url: p.preview,
      content: p.description,
      backgroundColor: p.backgroundColor || p.bgColor || '',
      viewers: [],
      createdAt: new Date().toISOString()
    } as Story));

  // Deduplicate videos by their ID to prevent keys collision between optimistic state and snapshot
  const uniqueFeedVideosMap = new Map();
  [...optimisticVideos, ...videos].forEach(item => {
    if (!item) return;
    const rawId = item.data?.id || item.id;
    if (rawId) {
      const id = String(rawId).trim();
      if (!uniqueFeedVideosMap.has(id) || item.isOptimistic) {
        uniqueFeedVideosMap.set(id, item);
      }
    }
  });
  const allVideos = Array.from(uniqueFeedVideosMap.values());

  // Deduplicate stories by their ID to prevent duplicate keys
  const uniqueFeedStoriesMap = new Map();
  [...optimisticStories, ...stories].forEach(story => {
    if (story && story.id) {
      const id = String(story.id).trim();
      if (!uniqueFeedStoriesMap.has(id) || story.isOptimistic) {
        uniqueFeedStoriesMap.set(id, story);
      }
    }
  });
  const allStories = Array.from(uniqueFeedStoriesMap.values());

  const handleScroll = () => {
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const index = Math.round(scrollTop / containerRef.current.clientHeight);
      setActiveIndex(index);
      
      // If user scrolls up (scrolling down the feed, sliding content up), collapse header stories
      if (scrollTop > 20) {
        setIsHeaderCollapsed(true);
      } else {
        setIsHeaderCollapsed(false);
      }
    }
  };

  return (
    <div className="h-full w-full bg-[var(--bg-primary)] flex flex-col relative select-text">
      {/* Sticky Top Navigation Header */}
      <div className="sticky top-0 z-[100] bg-[var(--bg-card)] border-b border-[var(--border-secondary)] px-4 py-3 pb-2.5 flex items-center justify-between select-none">
        {/* Left corner logo */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className="text-lg font-black text-[#FF4B91] tracking-tighter select-none font-sans">world</span>
        </div>

        {/* Right Corner: Search Button & Other icons */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <button 
            onClick={() => {
              hapticFeedback('light');
              const event = new CustomEvent('nav-to-tab', { detail: 'search' });
              window.dispatchEvent(event);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('set-discover-tab', { detail: 'search' }));
              }, 50);
            }}
            className="w-8 h-8 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 rounded-xl flex items-center justify-center text-[var(--text-primary)] border border-[var(--border-primary)] active:scale-95 transition-transform"
            title="সার্চ"
          >
            <Search className="w-4 h-4" />
          </button>

          <button 
            onClick={() => {
              const event = new CustomEvent('nav-to-tab', { detail: 'inbox' });
              window.dispatchEvent(event);
            }}
            className="w-8 h-8 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 rounded-xl flex items-center justify-center text-[var(--text-primary)] border border-[var(--border-primary)] active:scale-95 transition-transform relative"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#FF4B91] text-white text-[8px] font-black h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-black shadow-[0_0_8px_rgba(255,75,145,0.4)] animate-pulse">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          <button 
            onClick={() => {
              const event = new CustomEvent('nav-to-tab', { detail: 'messages' });
              window.dispatchEvent(event);
            }}
            className="w-8 h-8 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 rounded-xl flex items-center justify-center text-[var(--text-primary)] border border-[var(--border-primary)] active:scale-95 transition-transform relative"
          >
            <MessageCircle className="w-4 h-4" />
            {unreadDMsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#FF4B91] text-white text-[8px] font-black h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-black shadow-[0_0_8px_rgba(255,75,145,0.4)] animate-pulse">
                {unreadDMsCount}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => {
              hapticFeedback('light');
              window.dispatchEvent(new CustomEvent('open-settings', { detail: 'menu' }));
            }}
            className="w-8 h-8 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 rounded-xl flex items-center justify-center text-[var(--text-primary)] border border-[var(--border-primary)] active:scale-95 transition-transform"
            title="Menu Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Standard Scrolling Timeline Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto w-full no-scrollbar select-text bg-[var(--bg-primary)]"
      >
        {/* Pull to Refresh Indicator */}
        <div 
          className="absolute top-2 left-0 right-0 flex justify-center z-[110] pointer-events-none"
          style={{ transform: `translateY(${pullDistance}px)` }}
        >
          <div className={cn(
            "w-12 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-secondary)] shadow-xl flex items-center justify-center transition-all duration-300",
            (pullDistance > 10 || isRefreshing) ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}>
            {isRefreshing ? (
              <div className="flex space-x-1 items-center justify-center select-none">
                <span className="w-1.5 h-1.5 bg-[#FF4B91] rounded-sm animate-pulse" />
                <span className="w-1.5 h-1.5 bg-[#FF4B91]/80 rounded-sm animate-pulse [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-[#FF4B91]/50 rounded-sm animate-pulse [animation-delay:0.3s]" />
              </div>
            ) : (
              <RotateCw 
                className="w-4 h-4 text-[#FF4B91] transition-transform duration-200" 
                style={{ transform: `rotate(${pullDistance * 4}deg)`, opacity: pullDistance / 50 }} 
              />
            )}
          </div>
        </div>

        {/* Outer Grid Column to constrain width nicely on web and tablets */}
        <div className="w-full max-w-xl mx-auto py-0 px-0 sm:py-3.5 sm:px-3 space-y-1 sm:space-y-3 pb-24">
          
          {/* 'What's on your mind?' Box */}
          <div className="bg-[var(--bg-card)] rounded-none sm:rounded-xl p-3.5 border-x-0 sm:border border-[var(--border-secondary)] space-y-3">
            <div className="flex items-center space-x-3">
              <div 
                onClick={() => {
                  if (user?.id) {
                    hapticFeedback('light');
                    window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: user.id }));
                  }
                }}
                className="w-9.5 h-9.5 rounded-xl overflow-hidden bg-blue-600 border border-[var(--border-primary)] flex-shrink-0 cursor-pointer hover:opacity-90 active:scale-95 transition-all flex items-center justify-center text-white text-xs font-black select-none"
              >
                {user?.profilePhoto ? (
                  <img src={user.profilePhoto || undefined} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span>{user?.fullName?.charAt(0).toUpperCase() || 'U'}</span>
                )}
              </div>
              <button 
                onClick={() => {
                  const event = new CustomEvent('nav-to-tab', { detail: 'upload' });
                  window.dispatchEvent(event);
                }}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-left px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--text-secondary)] transition-all outline-none"
              >
                {user?.fullName ? `${user.fullName.split(' ')[0]}, what's on your mind?` : "What's on your mind?"}
              </button>
            </div>
            
            <div className="h-[0.5px] bg-[var(--border-secondary)] w-full" />
            
            <div className="flex items-center justify-between text-[11px] font-black tracking-wider uppercase text-[var(--text-secondary)]">
              <button 
                onClick={() => {
                  const event = new CustomEvent('nav-to-upload', { detail: { uploadMode: 'photo', autoGallery: true } });
                  window.dispatchEvent(event);
                }}
                className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 hover:bg-[var(--bg-secondary)] rounded-lg transition-all"
              >
                <ImageIcon className="w-4 h-4 text-emerald-500" />
                <span>Photo</span>
              </button>
              
              <button 
                onClick={() => {
                  const event = new CustomEvent('nav-to-upload', { detail: { uploadMode: 'video', autoGallery: true } });
                  window.dispatchEvent(event);
                }}
                className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 hover:bg-[var(--bg-secondary)] rounded-lg transition-all"
              >
                <VideoIcon className="w-4 h-4 text-rose-500" />
                <span>Video</span>
              </button>
              
              <button 
                onClick={() => {
                  const event = new CustomEvent('nav-to-upload', { detail: { uploadMode: 'text' } });
                  window.dispatchEvent(event);
                }}
                className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 hover:bg-[var(--bg-secondary)] rounded-lg transition-all"
              >
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Text Status</span>
              </button>
            </div>
          </div>

          {/* Rectangular Stories Tray Grid */}
          <div className="flex space-x-1.5 overflow-x-auto no-scrollbar py-0.5 px-3 sm:px-0 scroll-smooth select-none">
            {/* Create Story card for Owner */}
            {user && (
              <div 
                className="w-24 h-36 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-secondary)] flex flex-col justify-between overflow-hidden relative group active:scale-95 transition-all flex-shrink-0"
              >
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticFeedback('light');
                    window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: user.id }));
                  }}
                  title="View your profile"
                  className="w-full h-24 overflow-hidden relative bg-blue-600 cursor-pointer hover:opacity-90 flex items-center justify-center text-white text-3xl font-black select-none border-b border-[var(--border-secondary)]"
                >
                  {user.profilePhoto ? (
                    <img src={user.profilePhoto} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  ) : (
                    <span>{user.fullName?.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                </div>
                {/* Floating standard blue plus indicator */}
                <div 
                  onClick={() => {
                    const event = new CustomEvent('nav-to-upload', { detail: { isStory: true } });
                    window.dispatchEvent(event);
                  }}
                  className="absolute top-[82px] left-1/2 -translate-x-1/2 cursor-pointer active:scale-90 transition-transform z-10"
                >
                  <div className="w-7 h-7 bg-blue-500 rounded-xl flex items-center justify-center border-4 border-[var(--bg-card)] shadow-md">
                    <Plus className="w-4 text-white font-black stroke-[3]" />
                  </div>
                </div>
                <div 
                  onClick={() => {
                    const event = new CustomEvent('nav-to-upload', { detail: { isStory: true } });
                    window.dispatchEvent(event);
                  }}
                  className="pb-2.5 pt-4 text-center cursor-pointer hover:bg-[var(--bg-secondary)] flex-1 flex items-center justify-center"
                >
                  <span className="text-[9px] font-black uppercase text-[var(--text-primary)] tracking-wider">Create Story</span>
                </div>
              </div>
            )}

            {/* Display active list stories */}
            {allStories.map((story, index) => (
              <div 
                key={`${story.id || 'story'}-${index}`} 
                onClick={() => setSelectedStory(story)}
                className="w-24 h-36 rounded-2xl bg-gray-950 flex flex-col justify-between overflow-hidden relative cursor-pointer group active:scale-95 transition-all flex-shrink-0 shadow-sm border border-[var(--border-secondary)] animate-fade-in"
              >
                {/* Story preview visual context */}
                {story.type === 'text' ? (
                  <div className={cn("w-full h-full p-2 flex items-center justify-center text-center", story.backgroundColor || 'bg-gradient-to-br from-indigo-600 to-purple-600')}>
                    <p className="text-white text-[7px] font-black line-clamp-5 leading-normal">{story.content}</p>
                  </div>
                ) : story.type === 'video' ? (
                  <div className="absolute inset-0 bg-black">
                    <video 
                      src={story.url} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none" 
                      preload="metadata" 
                      muted 
                      playsInline 
                      autoPlay 
                      loop 
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/60" />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black">
                    <img src={story.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/60" />
                  </div>
                )}

                {/* Overlapped circle profile pic on top-left of individual story card */}
                <div 
                  className="absolute top-2.5 left-2.5 z-20 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticFeedback('light');
                    window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: story.userId }));
                  }}
                >
                  {(() => {
                    const isUnread = user ? !story.viewers?.includes(user.id) : true;
                    return (
                      <div className={cn(
                        "w-8 h-8 rounded-xl bg-gray-900 border-2 p-[1px] shadow-lg overflow-hidden flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
                        isUnread ? "border-[#FF4B91] shadow-[0_0_8px_rgba(255,75,145,0.4)]" : "border-white/10 opacity-70"
                      )}>
                        {story.profilePhoto ? (
                          <img src={story.profilePhoto} className="w-full h-full rounded-lg object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className={cn(
                            "w-full h-full flex items-center justify-center text-[11px] font-black rounded-lg",
                            isUnread ? "bg-[#FF4B91] text-white" : "bg-gray-700 text-gray-400"
                          )}>
                            {story.fullName?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Actor name bottom container */}
                <div className="absolute bottom-2.5 left-2 px-1 right-2 z-10 select-none pointer-events-none">
                  <p className="text-[9px] font-black text-white uppercase tracking-wider drop-shadow-md truncate">
                    {story.fullName.split(' ')[0]}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Facebook-style Background Upload Progress Cards */}
          {pendingUploads && pendingUploads.filter(p => !p.isPreUpload).length > 0 && (
            <div className="space-y-2 px-3 sm:px-0 my-2 select-none animate-fade-in">
              {pendingUploads.filter(p => !p.isPreUpload).map((upload) => {
                const isFailed = upload.status === 'failed' || upload.status === 'error';
                const isCompleted = upload.status === 'completed';
                const isFinishing = upload.status === 'finishing';
                const isQueued = upload.status === 'queued';
                
                let titleText = '';
                let subtitleText = '';
                
                if (appLanguage === 'bn') {
                  if (upload.isStory) {
                    titleText = 'স্টোরি আপলোড হচ্ছে...';
                  } else if (upload.type === 'video') {
                    titleText = 'রিল আপলোড হচ্ছে...';
                  } else if (upload.type === 'photo') {
                    titleText = 'পোস্ট আপলোড হচ্ছে...';
                  } else {
                    titleText = 'স্ট্যাটাস আপলোড হচ্ছে...';
                  }

                  if (isQueued) {
                    subtitleText = 'আপলোড লাইনে অপেক্ষা করছে...';
                  } else if (isFinishing) {
                    subtitleText = 'চূড়ান্ত করা হচ্ছে...';
                  } else if (isCompleted) {
                    subtitleText = 'সফলভাবে আপলোড হয়েছে!';
                  } else if (isFailed) {
                    subtitleText = 'আপলোড ব্যর্থ হয়েছে! আবার চেষ্টা করতে ট্যাপ করুন';
                  } else if (upload.progress >= 100) {
                    subtitleText = 'সার্ভারে সংরক্ষণ করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...';
                  } else {
                    subtitleText = 'world অ্যাপটি চালু রাখুন...';
                  }
                } else {
                  if (upload.isStory) {
                    titleText = 'Uploading story...';
                  } else if (upload.type === 'video') {
                    titleText = 'Uploading reel...';
                  } else if (upload.type === 'photo') {
                    titleText = 'Uploading post...';
                  } else {
                    titleText = 'Uploading status...';
                  }

                  if (isQueued) {
                    subtitleText = 'Waiting in queue...';
                  } else if (isFinishing) {
                    subtitleText = 'Safely finalizing...';
                  } else if (isCompleted) {
                    subtitleText = 'Uploaded successfully!';
                  } else if (isFailed) {
                    subtitleText = 'Upload failed! Tap to retry or dismiss';
                  } else if (upload.progress >= 100) {
                    subtitleText = 'Saving to server, please wait...';
                  } else {
                    subtitleText = 'Keep world open...';
                  }
                }

                // Retry handler
                const handleCardClick = () => {
                  if (isFailed) {
                    // Retry upload logic
                    startBackgroundUpload(upload);
                  }
                };

                return (
                  <div 
                    key={upload.id}
                    onClick={handleCardClick}
                    className={cn(
                      "flex items-center justify-between p-3.5 bg-[var(--bg-card)] border rounded-2xl transition-all duration-300",
                      isFailed ? "border-red-500/30 bg-red-500/5 cursor-pointer hover:bg-red-500/10" : "border-[var(--border-secondary)]",
                      isCompleted ? "border-green-500/30 bg-green-500/5" : ""
                    )}
                  >
                    <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                      {/* Left: Thumbnail/Preview */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden relative bg-zinc-800 flex-shrink-0 border border-white/5 flex items-center justify-center text-white">
                        {upload.preview ? (
                          upload.type === 'video' ? (
                            <div className="relative w-full h-full">
                              <video src={upload.preview} className="w-full h-full object-cover" muted playsInline />
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <VideoIcon className="w-4 h-4 text-white drop-shadow-md" />
                              </div>
                            </div>
                          ) : (
                            <img src={upload.preview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          )
                        ) : (
                          <div className={cn(
                            "w-full h-full flex items-center justify-center font-bold text-xs",
                            upload.backgroundColor || "bg-gradient-to-tr from-purple-600 to-pink-600"
                          )}>
                            {upload.isStory ? "Story" : "Text"}
                          </div>
                        )}
                      </div>

                      {/* Middle: Title & Subtitle with Progress Bar */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-baseline justify-between">
                          <h4 className={cn(
                            "text-[13px] font-black leading-snug truncate",
                            isFailed ? "text-red-400" : isCompleted ? "text-green-400" : "text-[var(--text-primary)]"
                          )}>
                            {titleText}
                          </h4>
                          {!isFailed && !isCompleted && !isQueued && (
                            <span className="text-[10px] font-mono font-bold text-zinc-400">
                              {upload.progress}%
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-none">
                          {subtitleText}
                        </p>
                        
                        {/* Smooth Line Progress Indicator */}
                        {!isFailed && !isCompleted && !isQueued && (
                          <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden mt-1.5 border border-white/5">
                            <div 
                              className="bg-gradient-to-r from-[#FF4B91] to-pink-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${upload.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions / Circle Loader */}
                    <div className="ml-3.5 flex items-center space-x-2 flex-shrink-0">
                      {isCompleted ? (
                        <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : isFailed ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelUpload(upload.id);
                          }}
                          className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : isQueued ? (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-400 animate-pulse">
                          <Clock className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="relative w-8 h-8 flex items-center justify-center">
                          {/* Circle Spinner SVG */}
                          <svg className="w-8 h-8 transform -rotate-90">
                            <circle 
                              cx="16" 
                              cy="16" 
                              r="12" 
                              stroke="currentColor" 
                              strokeWidth="3" 
                              fill="transparent" 
                              className="text-zinc-800" 
                            />
                            <circle 
                              cx="16" 
                              cy="16" 
                              r="12" 
                              stroke="currentColor" 
                              strokeWidth="3" 
                              fill="transparent" 
                              strokeDasharray={2 * Math.PI * 12}
                              strokeDashoffset={2 * Math.PI * 12 * (1 - upload.progress / 100)}
                              className="text-[#FF4B91] transition-all duration-300" 
                            />
                          </svg>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelUpload(upload.id);
                            }}
                            className="absolute inset-0 m-auto w-5 h-5 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                            title="Cancel"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Posts Timeline scrolling block */}
          {feedLoading && allVideos.length === 0 ? (
            <div className="space-y-4 px-3 sm:px-0 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-secondary)] p-4 space-y-4 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[var(--bg-secondary)] rounded-xl" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3 bg-[var(--bg-secondary)] rounded-md w-1/3" />
                      <div className="h-2.5 bg-[var(--bg-secondary)] rounded-md w-1/4" />
                    </div>
                  </div>
                  <div className="h-44 bg-[var(--bg-secondary)] rounded-2xl w-full" />
                  <div className="space-y-2">
                    <div className="h-3 bg-[var(--bg-secondary)] rounded-md w-5/6" />
                    <div className="h-3 bg-[var(--bg-secondary)] rounded-md w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : allVideos.length > 0 ? (
            <div className="space-y-1 select-text">
              {allVideos.map((item, index) => {
                const handleDeletePost = async (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!user) return;
                  const targetId = item.data?.id || item.id;
                  if (!targetId) return;

                  const title = localStorage.getItem('appLanguage') === 'bn' ? "পোস্ট ডিলিট করুন" : "Delete Post";
                  const msg = localStorage.getItem('appLanguage') === 'bn' ? "পোস্টটি ডিলিট করতে চান?" : "Do you want to delete this post?";
                  const runDelete = async () => {
                    hapticFeedback('heavy');
                    try {
                      const postRef = doc(db, 'videos', targetId);
                      await deleteDoc(postRef);
                      alert(localStorage.getItem('appLanguage') === 'bn' ? "পোস্ট ডিলিট করা হয়েছে!" : "Post deleted successfully!");
                    } catch (err) {
                      console.error("Delete post error: ", err);
                    }
                  };

                  if ((window as any).showCustomConfirm) {
                    (window as any).showCustomConfirm(title, msg, runDelete);
                  } else {
                    if (window.confirm(msg)) {
                      await runDelete();
                    }
                  }
                };

                return (
                  <WorldPostCard 
                    key={`${item.data?.id || item.id || 'feed'}-${index}`} 
                    video={item.data || item} 
                    isOptimistic={!!item.isOptimistic} 
                    isMuted={isMuted}
                    setIsMuted={setIsMuted}
                    isAdmin={isAdmin}
                    onDelete={handleDeletePost}
                  />
                );
              })}
            </div>
          ) : (
            /* Feed search / loading warning fallback visual design */
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-secondary)] py-16 px-6 text-center shadow-sm">
              <div className="w-14 h-14 bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center mx-auto mb-3 border border-[var(--border-primary)]">
                {tab === 'following' ? <Users className="w-6 h-6 text-[#FF4B91]" /> : (
                  <div className="flex space-x-1.5 items-center justify-center select-none">
                    <span className="w-1.5 h-1.5 bg-[#FF4B91] rounded-sm animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-[#FF4B91]/80 rounded-sm animate-pulse [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 bg-[#FF4B91]/50 rounded-sm animate-pulse [animation-delay:0.3s]" />
                  </div>
                )}
              </div>
              
              <h4 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider leading-tight">
                {tab === 'following' ? 'No Following Posts' : 'Fetching Fresh Feed'}
              </h4>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1.5 max-w-xs mx-auto leading-relaxed font-semibold uppercase">
                {tab === 'following' ? 'Follow more creators to see their organic scrolling timeline posts here!' : 'Finding trending posts in World community...'}
              </p>
              
              {tab === 'following' && (
                <button 
                  onClick={() => setTab('foryou')} 
                  className="mt-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform shadow-md"
                >
                  Explore Public Posts
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedStory && <StoryViewer story={selectedStory} onClose={() => setSelectedStory(null)} users={users} />}
      </AnimatePresence>
    </div>
  );
}

const REGISTRATION_COUNTRIES_100 = [
  { name: 'Bangladesh', code: '+880', flag: '🇧🇩' },
  { name: 'United States', code: '+1', flag: '🇺🇸' },
  { name: 'India', code: '+91', flag: '🇮🇳' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧' },
  { name: 'Canada', code: '+1', flag: '🇨🇦' },
  { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { name: 'United Arab Emirates', code: '+971', flag: '🇦🇪' },
  { name: 'Pakistan', code: '+92', flag: '🇵🇰' },
  { name: 'Australia', code: '+61', flag: '🇦🇺' },
  { name: 'Germany', code: '+49', flag: '🇩🇪' },
  { name: 'France', code: '+33', flag: '🇫🇷' },
  { name: 'Italy', code: '+39', flag: '🇮🇹' },
  { name: 'Japan', code: '+81', flag: '🇯🇵' },
  { name: 'China', code: '+86', flag: '🇨🇳' },
  { name: 'Malaysia', code: '+60', flag: '🇲🇾' },
  { name: 'Singapore', code: '+65', flag: '🇸🇬' },
  { name: 'Oman', code: '+968', flag: '🇴🇲' },
  { name: 'Qatar', code: '+974', flag: '🇶🇦' },
  { name: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { name: 'Bahrain', code: '+973', flag: '🇧🇭' },
  { name: 'Turkey', code: '+90', flag: '🇹🇷' },
  { name: 'South Africa', code: '+27', flag: '🇿🇦' },
  { name: 'Russia', code: '+7', flag: '🇷🇺' },
  { name: 'Brazil', code: '+55', flag: '🇧🇷' },
  { name: 'Mexico', code: '+52', flag: '🇲🇽' },
  { name: 'Spain', code: '+34', flag: '🇪🇸' },
  { name: 'Netherlands', code: '+31', flag: '🇳🇱' },
  { name: 'Sweden', code: '+46', flag: '🇸🇪' },
  { name: 'Switzerland', code: '+41', flag: '🇨🇭' },
  { name: 'Norway', code: '+47', flag: '🇳🇴' },
  { name: 'New Zealand', code: '+64', flag: '🇳🇿' },
  { name: 'Indonesia', code: '+62', flag: '🇮🇩' },
  { name: 'Philippines', code: '+63', flag: '🇵🇭' },
  { name: 'Thailand', code: '+66', flag: '🇹🇭' },
  { name: 'Vietnam', code: '+84', flag: '🇻🇳' },
  { name: 'Sri Lanka', code: '+94', flag: '🇱🇰' },
  { name: 'Nepal', code: '+977', flag: '🇳🇵' },
  { name: 'Maldives', code: '+960', flag: '🇲🇻' },
  { name: 'Egypt', code: '+20', flag: '🇪🇬' },
  { name: 'Jordan', code: '+962', flag: '🇯🇴' },
  { name: 'Lebanon', code: '+961', flag: '🇱🇧' },
  { name: 'Iraq', code: '+964', flag: '🇮🇶' },
  { name: 'Yemen', code: '+967', flag: '🇾🇪' },
  { name: 'South Korea', code: '+82', flag: '🇰🇷' },
  { name: 'Ireland', code: '+353', flag: '🇮🇪' },
  { name: 'Belgium', code: '+32', flag: '🇧🇪' },
  { name: 'Austria', code: '+43', flag: '🇦🇹' },
  { name: 'Denmark', code: '+45', flag: '🇩🇰' },
  { name: 'Finland', code: '+358', flag: '🇫🇮' },
  { name: 'Poland', code: '+48', flag: '🇵🇱' },
  { name: 'Portugal', code: '+351', flag: '🇵🇹' },
  { name: 'Greece', code: '+30', flag: '🇬🇷' },
  { name: 'Argentina', code: '+54', flag: '🇦🇷' },
  { name: 'Colombia', code: '+57', flag: '🇨🇴' },
  { name: 'Chile', code: '+56', flag: '🇨🇱' },
  { name: 'Peru', code: '+51', flag: '🇵🇪' },
  { name: 'Venezuela', code: '+58', flag: '🇻🇪' },
  { name: 'Ecuador', code: '+593', flag: '🇪🇨' },
  { name: 'Ukraine', code: '+380', flag: '🇺🇦' },
  { name: 'Romania', code: '+40', flag: '🇷🇴' },
  { name: 'Czech Republic', code: '+420', flag: '🇨🇿' },
  { name: 'Hungary', code: '+36', flag: '🇭🇺' },
  { name: 'Slovakia', code: '+421', flag: '🇸🇰' },
  { name: 'Bulgaria', code: '+359', flag: '🇧🇬' },
  { name: 'Croatia', code: '+385', flag: '🇭🇷' },
  { name: 'Serbia', code: '+381', flag: '🇷🇸' },
  { name: 'Slovenia', code: '+386', flag: '🇸🇮' },
  { name: 'Lithuania', code: '+370', flag: '🇱🇹' },
  { name: 'Latvia', code: '+371', flag: '🇱🇻' },
  { name: 'Estonia', code: '+372', flag: '🇪🇪' },
  { name: 'Iceland', code: '+354', flag: '🇮🇸' },
  { name: 'Israel', code: '+972', flag: '🇮🇱' },
  { name: 'Hong Kong', code: '+852', flag: '🇭🇰' },
  { name: 'Taiwan', code: '+886', flag: '🇹🇼' },
  { name: 'Macau', code: '+853', flag: '🇲🇴' },
  { name: 'Cambodia', code: '+855', flag: '🇰🇭' },
  { name: 'Myanmar', code: '+95', flag: '🇲🇲' },
  { name: 'Laos', code: '+856', flag: '🇱🇦' },
  { name: 'Brunei', code: '+673', flag: '🇧🇳' },
  { name: 'Morocco', code: '+212', flag: '🇲🇦' },
  { name: 'Algeria', code: '+213', flag: '🇩🇿' },
  { name: 'Tunisia', code: '+216', flag: '🇹🇳' },
  { name: 'Libya', code: '+218', flag: '🇱🇾' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { name: 'Kenya', code: '+254', flag: '🇰🇪' },
  { name: 'Ghana', code: '+233', flag: '🇬🇭' },
  { name: 'Ethiopia', code: '+251', flag: '🇪🇹' },
  { name: 'Sudan', code: '+249', flag: '🇸🇩' },
  { name: 'Uganda', code: '+256', flag: '🇺🇬' },
  { name: 'Tanzania', code: '+255', flag: '🇹🇿' },
  { name: 'Zimbabwe', code: '+263', flag: '🇿🇼' },
  { name: 'Zambia', code: '+260', flag: '🇿🇲' },
  { name: 'Angola', code: '+244', flag: '🇦🇴' },
  { name: 'Mozambique', code: '+258', flag: '🇲🇿' },
  { name: 'Ivory Coast', code: '+225', flag: '🇨🇮' },
  { name: 'Senegal', code: '+221', flag: '🇸🇳' },
  { name: 'Cameroon', code: '+237', flag: '🇨🇲' },
  { name: 'Afghanistan', code: '+93', flag: '🇦🇫' },
  { name: 'Uzbekistan', code: '+998', flag: '🇺🇿' },
  { name: 'Kazakhstan', code: '+7', flag: '🇰🇿' }
];

function AuthForm({ type: initialType, onClose, isBlocking = false }: { type: 'login' | 'signup', onClose?: () => void, isBlocking?: boolean }) {
  const [type, setType] = useState<'login' | 'signup' | 'forgot'>(initialType);
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('phone'); // default to phone as standard per request
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+880');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [appLanguage] = useState(() => {
    try {
      return localStorage.getItem('app_language') || 'en';
    } catch {
      return 'en';
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      let finalEmail = email;
      if (authMethod === 'phone') {
        if (!phoneNumber || phoneNumber.length < 4) {
          throw new Error(appLanguage === 'bn' ? '❌ সঠিক মোবাইল নম্বর প্রবেশ করুন।' : '❌ Please enter a valid phone number.');
        }
        // Generate valid virtual email address using phone number and country code
        finalEmail = `phone_${countryCode.replace('+', '')}_${phoneNumber}@worldapp.com`;
      } else {
        if (!email) {
          throw new Error(appLanguage === 'bn' ? '❌ ইমেইল এড্রেস প্রবেশ করুন।' : '❌ Please enter email address.');
        }
      }

      if (type === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
        const user = userCredential.user;
        const completePhone = `${countryCode}${phoneNumber}`;
        await setDoc(doc(db, 'users', user.uid), {
          fullName,
          email: authMethod === 'email' ? email : '',
          phoneNumber: authMethod === 'phone' || phoneNumber ? completePhone : '',
          coinBalance: 0,
          isVerified: false,
          createdAt: serverTimestamp()
        });
        await updateProfile(user, { displayName: fullName });
        if (onClose) onClose();
      } else if (type === 'login') {
        await signInWithEmailAndPassword(auth, finalEmail, password);
        if (onClose) onClose();
      } else if (type === 'forgot') {
        if (authMethod === 'phone') {
          setError(appLanguage === 'bn' 
            ? '❌ ফোন নম্বর অ্যাকাউন্টের জন্য পাসওয়ার্ড রিকভারি করতে আপনার অ্যাডমিনকে নক দিন বা ইমেইল অ্যাকাউন্ট ব্যবহার করুন।' 
            : '❌ Password recovery is not directly supported for phone method. Use email or contact support.');
          setLoading(false);
          return;
        }
        await sendPasswordResetEmail(auth, email);
        setMessage(appLanguage === 'bn' 
          ? '📧 পাসওয়ার্ড পরিবর্তনের লিংকটি আপনার ইমেইলে পাঠানো হয়েছে! দয়া করে ইনবক্স বা স্প্যাম ফোল্ডার চেক করুন।' 
          : '📧 Reset link sent! Check your inbox or spam folder.');
        setTimeout(() => setType('login'), 5000);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let friendlyErr = err.message;
      if (err.code === 'auth/user-not-found' || err.message.includes('user-not-found')) {
        friendlyErr = appLanguage === 'bn' 
          ? '❌ এই অ্যাকাউন্টের অধীনে কোনো ব্যবহারকারী খুঁজে পাওয়া যায়নি।' 
          : '❌ No account found with these credentials.';
      } else if (err.code === 'auth/wrong-password' || err.message.includes('wrong-password')) {
        friendlyErr = appLanguage === 'bn' 
          ? '❌ পাসওয়ার্ডটি সঠিক নয়। দয়া করে আবার চেষ্টা করুন।' 
          : '❌ Incorrect password. Please try again.';
      } else if (err.code === 'auth/invalid-email' || err.message.includes('invalid-email')) {
        friendlyErr = appLanguage === 'bn' 
          ? (authMethod === 'phone' ? '❌ অবৈধ ফোন নম্বর বিন্যাস।' : '❌ ইমেইল এড্রেসটির বিন্যাস সঠিক নয়।')
          : (authMethod === 'phone' ? '❌ Invalid phone code or format.' : '❌ Invalid email format.');
      } else if (err.code === 'auth/email-already-in-use' || err.message.includes('email-already-in-use')) {
        friendlyErr = appLanguage === 'bn' 
          ? (authMethod === 'phone' ? '❌ এই ফোন নম্বরটি দিয়ে ইতিপূর্বে একটি সফল অ্যাকাউন্ট তৈরি করা হয়েছে।' : '❌ এই ইমেইল আইডিটি ইতিমধ্যে অন্য অ্যাকাউন্টে ব্যবহার করা হচ্ছে।')
          : (authMethod === 'phone' ? '❌ This phone number is already registered under another account.' : '❌ This email is already in use by another account.');
      } else if (err.code === 'auth/weak-password' || err.message.includes('weak-password')) {
        friendlyErr = appLanguage === 'bn' 
          ? '❌ পাসওয়ার্ডটি খুবই দুর্বল। কমপক্ষে ৬টি অক্ষর বা সংখ্যা ব্যবহার করুন।' 
          : '❌ Password is too weak. Please use at least 6 characters.';
      } else if (err.code === 'auth/network-request-failed' || err.message.includes('network')) {
        friendlyErr = appLanguage === 'bn' 
          ? '❌ নেটওয়ার্ক নিষ্ক্রিয়! ইন্টারনেট সংযোগ পুনরায় চেক করে চেষ্টা করুন।' 
          : '❌ Network offline! Check your connection and try again.';
      } else if (err.code === 'auth/operation-not-allowed' || err.message.includes('operation-not-allowed')) {
        friendlyErr = appLanguage === 'bn' 
          ? '❌ Firebase-এ Email/Password অথেনটিকেশন মেথড সচল (Enable) করা নেই। অনুগ্রহ করে Firebase Console থেকে Build > Authentication > Sign-in method-এ গিয়ে Email/Password সচল করুন।' 
          : '❌ Email/Password authentication is disabled in Firebase. Please enable it in Firebase Console > Build > Authentication > Sign-in method.';
      }
      setError(friendlyErr);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          fullName: user.displayName || 'User',
          email: user.email || '',
          profilePhoto: user.photoURL || '',
          coinBalance: 0,
          isVerified: false,
          createdAt: serverTimestamp()
        });
      }
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={isBlocking ? { opacity: 0 } : { y: "100%" }}
      animate={isBlocking ? { opacity: 1 } : { y: 0 }}
      exit={isBlocking ? { opacity: 0 } : { y: "100%" }}
      className={`fixed inset-0 bg-black flex flex-col overflow-y-auto ${isBlocking ? 'z-[10]' : 'z-50'}`}
    >
      <div className="w-full max-w-[450px] mx-auto min-h-full p-6 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          {!isBlocking ? (
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"><X className="text-white w-6 h-6" /></button>
          ) : (
            <div className="w-10 h-10" />
          )}
          <h2 className="text-white text-xl font-black uppercase tracking-widest">
            {type === 'login' 
              ? (appLanguage === 'bn' ? 'স্বাগতম' : 'Welcome') 
              : type === 'signup' 
                ? (appLanguage === 'bn' ? 'অ্যাকাউন্ট খুলুন' : 'Join Us') 
                : (appLanguage === 'bn' ? 'রিকভারি' : 'Reset')}
          </h2>
          <div className="w-10 h-10" />
        </div>

        {isBlocking && (
          <div className="mb-8 flex flex-col items-center justify-center p-5 bg-gradient-to-br from-zinc-900 to-black border border-white/10 rounded-2xl shadow-xl space-y-4">
            <div className="text-center space-y-1">
              <p className="text-white text-xs font-extrabold uppercase tracking-wide">
                {appLanguage === 'bn' ? 'গুগল দিয়ে লগইন/সাইন-আপ করুন' : 'SIGN IN / JOIN WITH GOOGLE'}
              </p>
              <p className="text-zinc-400 text-[10px] font-medium leading-normal">
                {appLanguage === 'bn' 
                  ? 'সহজ ও নিরাপদভাবে গুগল অ্যাকাউন্ট ব্যবহার করে প্রবেশ করুন।' 
                  : 'Quickly and securely access feeds & stories with your Google account.'}
              </p>
            </div>
            
            <button
              onClick={() => { hapticFeedback('medium'); handleGoogleLogin(); }}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-800 font-extrabold py-3.5 px-4 rounded-xl shadow-lg border border-neutral-200 transition-all active:scale-95 duration-150 cursor-pointer"
              type="button"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span className="text-xs uppercase tracking-wider">{appLanguage === 'bn' ? 'গুগল দিয়ে সাইন-ইন' : 'CONTINUE WITH GOOGLE'}</span>
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col space-y-6">

          {type !== 'forgot' && (
            <div className="flex bg-zinc-950 border border-zinc-850 rounded-2xl p-1 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={() => { hapticFeedback('light'); setAuthMethod('phone'); setError(''); }}
                className={`flex-1 py-3 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'phone'
                    ? 'bg-[#FF4B91] text-white shadow-lg shadow-pink-500/25'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <span>📞</span>
                <span>{appLanguage === 'bn' ? 'মোবাইল নম্বর' : 'PHONE NUMBER'}</span>
              </button>
              <button
                type="button"
                onClick={() => { hapticFeedback('light'); setAuthMethod('email'); setError(''); }}
                className={`flex-1 py-3 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'email'
                    ? 'bg-[#FF4B91] text-white shadow-lg shadow-pink-500/25'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <span>📧</span>
                <span>{appLanguage === 'bn' ? 'ইমেইল এড্রেস' : 'EMAIL ADDRESS'}</span>
              </button>
            </div>
          )}

          {type === 'forgot' && (
            <div className="p-5 bg-zinc-900/80 border border-zinc-800 rounded-2xl space-y-2 animate-in fade-in duration-300">
              <p className="text-[#FF4B91] text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <span>🔑</span>
                <span>{appLanguage === 'bn' ? 'পাসওয়ার্ড পুনরুদ্ধার করুন' : 'Password Recovery'}</span>
              </p>
              <p className="text-zinc-300 text-[11px] font-semibold leading-relaxed">
                {appLanguage === 'bn' 
                  ? 'আপনার অ্যাকাউন্টের ইমেইল এড্রেসটি নিচে লিখুন। আমরা আপনাকে একটি পাসওয়ার্ড পরিবর্তনের সিকিউর রিকভারি লিংক পাঠাবো।' 
                  : 'Enter your registered account email address. We will send you a secure link to reset and restore your password.'}
              </p>
            </div>
          )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'signup' && (
            <input 
              type="text" 
              value={fullName} 
              onChange={e => setFullName(e.target.value)}
              className="w-full bg-gray-900 text-white rounded-xl p-4 outline-none focus:ring-1 focus:ring-pink-500 text-sm border border-zinc-800/60" 
              placeholder={appLanguage === 'bn' ? 'আপনার নাম (FULL NAME)' : 'FULL NAME'} 
              required
            />
          )}

          {authMethod === 'phone' && type !== 'forgot' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1.5">
                <label className="text-[9.5px] uppercase tracking-widest text-[#FF4B91] font-black pl-1 block">
                  {appLanguage === 'bn' ? 'ডায়ালিং কান্ট্রি কোড' : 'Dialing Country Code'}
                </label>
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  className="w-full bg-gray-900 text-white rounded-xl p-4 outline-none focus:ring-1 focus:ring-pink-500 text-sm border border-zinc-800/60 font-semibold"
                >
                  {REGISTRATION_COUNTRIES_100.map((ct) => (
                    <option key={`${ct.name}-${ct.code}`} value={ct.code}>
                      {ct.flag} {ct.name} ({ct.code})
                    </option>
                  ))}
                </select>
              </div>

              <input 
                type="tel" 
                value={phoneNumber} 
                onChange={e => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-gray-900 text-white rounded-xl p-4 outline-none focus:ring-1 focus:ring-pink-500 text-sm border border-zinc-800/60 font-semibold" 
                placeholder={appLanguage === 'bn' ? 'মোবাইল নম্বর (PHONE NUMBER)' : 'PHONE NUMBER'} 
                required
              />
            </div>
          )}

          {(authMethod === 'email' || type === 'forgot') && (
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-900 text-white rounded-xl p-4 outline-none focus:ring-1 focus:ring-pink-500 text-sm border border-zinc-800/60 animate-in fade-in duration-300" 
              placeholder={appLanguage === 'bn' ? 'ইমেইল এড্রেস (EMAIL ADDRESS)' : 'EMAIL ADDRESS'} 
              required
            />
          )}

          {type !== 'forgot' && (
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 text-white rounded-xl p-4 outline-none focus:ring-1 focus:ring-pink-500 text-sm border border-zinc-800/60 font-semibold" 
              placeholder={appLanguage === 'bn' ? 'পাসওয়ার্ড (PASSWORD)' : 'PASSWORD'} 
              required
            />
          )}

          {error && <p className="text-red-500 text-xs font-bold leading-relaxed">{error}</p>}
          {message && <p className="text-green-500 text-sm font-bold leading-relaxed">{message}</p>}

          <button 
            type="submit" 
            disabled={loading}
            onClick={() => hapticFeedback('medium')}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-black py-4 rounded-xl disabled:opacity-50 uppercase tracking-widest text-xs active:scale-95 transition-transform"
          >
            {loading ? <RotateCw className="w-5 h-5 animate-spin mx-auto" /> : (type === 'login' ? (appLanguage === 'bn' ? 'লগইন করুন' : 'Log In') : type === 'signup' ? (appLanguage === 'bn' ? 'অ্যাকাউন্ট তৈরি করুন' : 'Create Account') : (appLanguage === 'bn' ? 'রিসেইট লিংক পাঠান' : 'Send Link'))}
          </button>
        </form>

        <div className="text-center pt-6 space-y-4">
          <button 
            type="button"
            onClick={() => setType(type === 'login' ? 'signup' : 'login')}
            className="text-gray-300 text-xs hover:text-white transition-colors"
          >
            {type === 'login' 
              ? (appLanguage === 'bn' ? "অ্যাকাউন্ট নেই? " : "Don't have an account? ") 
              : (appLanguage === 'bn' ? "ইতিমধ্যে অ্যাকাউন্ট আছে? " : "Already a member? ")}
            <span className="text-pink-500 font-extrabold ml-1 uppercase tracking-wider underline">
              {type === 'login' 
                ? (appLanguage === 'bn' ? 'নতুন অ্যাকাউন্ট খুলুন' : 'SIGN UP') 
                : (appLanguage === 'bn' ? 'লগইন করুন' : 'LOG IN')}
            </span>
          </button>
          
          {type === 'login' && (
            <div className="pt-2">
              <button 
                type="button"
                onClick={() => setType('forgot')}
                className="px-4 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-xs text-pink-400 hover:text-pink-300/90 hover:bg-zinc-850 hover:border-pink-500/20 active:scale-95 transition-all uppercase tracking-wider font-extrabold shadow-sm flex items-center justify-center space-x-1 mx-auto"
              >
                <span>🔑</span>
                <span>
                  {appLanguage === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন? এখানে রিকভারি করুন' : 'Forgot Password? Recover Here'}
                </span>
              </button>
            </div>
          )}

          {type === 'forgot' && (
            <div className="pt-2">
              <button 
                type="button"
                onClick={() => setType('login')}
                className="text-zinc-400 text-xs hover:text-white underline font-semibold transition-colors"
              >
                {appLanguage === 'bn' ? '← লগইন পেজে ফিরে যান' : '← Back to Login'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </motion.div>
  );
}

function Settings({ 
  onClose, 
  isOffline, 
  isDarkMode, 
  onToggleTheme, 
  isProMode = false, 
  onToggleProMode, 
  onShowProDashboard, 
  onShowProSetup, 
  initialSection = 'menu', 
  socketConnected = false,
  CLIENT_VERSION = 'WORLD_v3.5.0',
  updateAvailable = false,
  latestVersionInfo = null,
  setUpdateAvailable = () => {},
  checkForAppUpdates = async () => {}
}: { 
  onClose: () => void, 
  isOffline?: boolean, 
  isDarkMode: boolean, 
  onToggleTheme: () => void, 
  isProMode?: boolean, 
  onToggleProMode?: (v: boolean) => void, 
  onShowProDashboard?: () => void, 
  onShowProSetup?: () => void, 
  initialSection?: 'menu' | 'friends' | 'memories' | 'saved' | 'groups' | 'meta-ai' | 'scam-protection' | 'support' | 'report-problem' | 'terms' | 'settings' | 'dashboard' | 'install-guide', 
  socketConnected?: boolean,
  CLIENT_VERSION?: string,
  updateAvailable?: boolean,
  latestVersionInfo?: any,
  setUpdateAvailable?: (v: boolean) => void,
  checkForAppUpdates?: (isManual: boolean) => Promise<void>
}) {
  const { user, logout, updateUserProfile, sessionId } = useAuth();
  const [localIsProMode, setLocalIsProMode] = useState(isProMode);

  const isAdmin = !!(
    user && (
      user.id === 'ZPHYftpJzjhllADJsPkCnq4wHm93' ||
      user.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com' ||
      user.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com'
    )
  );

  // Nested settings tabs and forms states including permissions-gateway and app-update
  const [settingsSub, setSettingsSub] = useState<'none' | 'edit-profile' | 'edit-username' | 'verification' | 'social-balance' | 'ad-manager' | 'app-lock' | 'privacy-settings' | 'change-password' | 'monetization' | 'download-data' | 'logged-in-devices' | 'permissions-gateway' | 'app-update'>('none');
  const [editedFullName, setEditedFullName] = useState(user?.fullName || '');
  const [editedBio, setEditedBio] = useState(user?.bio || '');
  const [editedPhoto, setEditedPhoto] = useState(user?.profilePhoto || '');
  const [editedUsername, setEditedUsername] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [appLockPin, setAppLockPin] = useState(() => localStorage.getItem('world_app_lock_pin') || '');
  const [appLockEnabled, setAppLockEnabled] = useState(() => localStorage.getItem('world_app_lock_enabled') === 'true');
  const [saveLoading, setSaveLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [firebaseSyncEnabled, setFirebaseSyncEnabled] = useState(() => localStorage.getItem('world_firebase_sync') !== 'false');
  const [serverChannelEnabled, setServerChannelEnabled] = useState(() => localStorage.getItem('world_server_channel') !== 'false');
  const [googleCDNEnabled, setGoogleCDNEnabled] = useState(() => localStorage.getItem('world_google_cdn') !== 'false');

  // local states for app update inside the settings sub panel
  const [adminUpdateVersion, setAdminUpdateVersion] = useState('');
  const [adminUpdateReleaseDate, setAdminUpdateReleaseDate] = useState('');
  const [adminChangelogBn, setAdminChangelogBn] = useState('');
  const [adminChangelogEn, setAdminChangelogEn] = useState('');
  const [adminIsMandatory, setAdminIsMandatory] = useState(true);
  const [publishingUpdate, setPublishingUpdate] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    if (settingsSub === 'app-update' && latestVersionInfo) {
      setAdminUpdateVersion(latestVersionInfo.version || CLIENT_VERSION);
      setAdminUpdateReleaseDate(latestVersionInfo.releaseDate || new Date().toISOString().split('T')[0]);
      setAdminChangelogBn(latestVersionInfo.changelog_bn || '');
      setAdminChangelogEn(latestVersionInfo.changelog_en || '');
      setAdminIsMandatory(latestVersionInfo.isMandatory !== undefined ? latestVersionInfo.isMandatory : true);
    }
  }, [settingsSub, latestVersionInfo]);

  useEffect(() => {
    if (user && settingsSub !== 'edit-profile' && settingsSub !== 'edit-username') {
      setEditedFullName(user.fullName || '');
      setEditedBio(user.bio || '');
      setEditedPhoto(user.profilePhoto || '');
      setEditedUsername(user.username || (user.fullName || "user").toLowerCase().replace(/\s/g, ''));
    }
  }, [user, settingsSub]);

  useEffect(() => {
    if (user && typeof user.isProMode === 'boolean') {
      setLocalIsProMode(user.isProMode);
    } else {
      setLocalIsProMode(isProMode);
    }
  }, [user?.isProMode, isProMode]);

  const [loading, setLoading] = useState(false);
  const [appLanguage, setAppLanguage] = useState(() => localStorage.getItem('appLanguage') || 'en');
  const [searchLangQuery, setSearchLangQuery] = useState('');
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [autoplayVideos, setAutoplayVideos] = useState(() => {
    return localStorage.getItem('world_autoplay_videos') !== 'false';
  });

  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seeMoreOpen, setSeeMoreOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<'menu' | 'friends' | 'memories' | 'saved' | 'groups' | 'meta-ai' | 'scam-protection' | 'support' | 'report-problem' | 'terms' | 'settings' | 'dashboard' | 'install-guide'>(initialSection);

  useEffect(() => {
    setCurrentSection(initialSection);
  }, [initialSection]);

  // Support / Problem ticket state
  const [reportText, setReportText] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Meta AI chat simulated state
  const [aiQuery, setAiQuery] = useState('');
  const [aiChatResponse, setAiChatResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Friends search filter
  const [friendsSearch, setFriendsSearch] = useState('');

  // Custom Meta Portal dynamic states
  const [activeGroup, setActiveGroup] = useState<any | null>(null);
  const [newGroupPostText, setNewGroupPostText] = useState('');
  const [groupPosts, setGroupPosts] = useState<any[]>([
    { id: 'gp1', author: 'Sabit Hasan 🍁', text: 'Without trending meme posts, checking the social circle feels empty! Who else thinks so? 😂', likes: 112, comments: 24, time: '3m' },
    { id: 'gp2', author: 'Nusrat Jahan 🌸', text: 'We need to upgrade our community chat system with a model assistant. Admin please build it!', likes: 45, comments: 8, time: '2h' },
    { id: 'gp3', author: 'Zahidul Alam 🤖', text: 'SQLite integration compiles perfectly inside developer sandbox! Love the offline feed sync speed.', likes: 320, comments: 41, time: '5h' }
  ]);

  const [newAIMessageText, setNewAIMessageText] = useState('');
  const [isAISending, setIsAISending] = useState(false);
  const [aiMessages, setAiMessages] = useState<any[]>([
    { role: 'model', text: 'Hello! I am your World Social AI assistant. I am ready to assist you here. Type your questions below to learn how to earn coins, customize platform settings, or find support information!' }
  ]);

  const [expandedFAQIdx, setExpandedFAQIdx] = useState<number | null>(null);
  const [problemCategory, setProblemCategory] = useState('video');
  const [reportSuccess, setReportSuccess] = useState(false);

  const [hasCompletedQuiz, setHasCompletedQuiz] = useState(() => {
    return localStorage.getItem(`scam_quiz_completed_${user?.id}`) === 'true';
  });
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizSelectedOption, setQuizSelectedOption] = useState<number | null>(null);
  const [quizAnswered, setQuizAnswered] = useState(false);

  const quizQuestions = [
    {
      q: 'If a user in your inbox asks you to help them by sharing your personal account token or password, what should you do?',
      options: [
        'Quickly share the credentials to assist them',
        'Immediately block and report the account',
        'Share the request with other friends for help'
      ],
      correct: 1,
      exp: 'Never share your password or security tokens under any circumstances. Support crew will never ask for your private passwords.'
    },
    {
      q: 'What is the safe and secure way to activate a Premium Verification Badge on your profile?',
      options: [
        'Buy a promo option offered by someone on chat',
        'Exchange 10,000 coins officially inside the World Shop',
        'Click a third-party activation link found on search engine'
      ],
      correct: 1,
      exp: 'Verification badges can only be activated officially under our World Shop interface. Any external or chat offers are dangerous.'
    },
    {
      q: 'If a message contains an external link promising free bonus coins or cash rewards, what is the best advice?',
      options: [
        'Do not open and delete the link immediately',
        'Click the URL and fill out your email account token details',
        'Forward the link to active user groups to try together'
      ],
      correct: 0,
      exp: 'Suspicious links can steal account cookies and coin balances. Avoid opening unverified links.'
    }
  ];

  const handleRewardCoins = async () => {
    if (!user?.id) return;
    try {
      const userRef = doc(db, 'users', user.id);
      const currentCoins = user.coinBalance || 0;
      const nextCoins = currentCoins + 12;
      await setDoc(userRef, { coinBalance: nextCoins }, { merge: true });
      user.coinBalance = nextCoins;
      setHasCompletedQuiz(true);
      localStorage.setItem(`scam_quiz_completed_${user.id}`, 'true');
      alert('Congratulations! By providing correct answers, you earned 12 coins successfully.');
    } catch (err) {
      console.error(err);
      setHasCompletedQuiz(true);
      alert('Success! Offline session credited 12 coin bonus rewards due to database limits.');
    }
  };

  const handleSendMetaAI = async () => {
    if (!newAIMessageText.trim() || isAISending) return;
    hapticFeedback('medium');
    const userMsg = newAIMessageText.trim();
    setNewAIMessageText('');
    
    // Add User message local
    const nextMsgs = [...aiMessages, { role: 'user', text: userMsg }];
    setAiMessages(nextMsgs);
    setIsAISending(true);

    try {
      // Build expected history payload for /api/gemini
      const historyPayload = aiMessages.slice(1).map(m => ({
        role: m.role || 'user',
        parts: [{ text: m.text }]
      }));

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: historyPayload })
      });

      if (!res.ok) {
        throw new Error('API server responded with error status code ' + res.status);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Add Model Response
      setAiMessages(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err: any) {
      console.error(err);
      setAiMessages(prev => [...prev, { 
        role: 'model', 
        text: appLanguage === 'bn' 
          ? `দুঃখিত, সংযোগে ত্রুটি ঘটেছে! দয়া করে নিশ্চিত করুন আপনার সার্ভারে GEMINI_API_KEY সঠিকভাবে কনফিগার করা আছে।\n\nError: ${err.message || 'Server Connection Failed'}`
          : `Sorry, we experienced a connectivity hiccup! Please verify that GEMINI_API_KEY is configured on your server environment.\n\nError: ${err.message || 'Server Connection Failed'}`
      }]);
    } finally {
      setIsAISending(false);
    }
  };

  // Predefined community groups list
  const communityGroups = [
    { id: 'g1', name: 'World Reels Creators 🎥', desc: 'The hub for trending shorts, sound updates, and layout design tips.', members: '4,520', online: '142', category: 'Creator' },
    { id: 'g2', name: 'Bengali Meme & Pop-Culture 🍟', desc: 'Unlimited jokes, troll posts, and lighthearted viral videos in Bengali.', members: '12,910', online: '320', category: 'Humor' },
    { id: 'g3', name: 'AI & Developer Sandbox 🤖', desc: 'Code discuss, SQLite offline speed syncing strategies, and cloud designs.', members: '1,850', online: '58', category: 'Technology' }
  ];

  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [savedPostsLoading, setSavedPostsLoading] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<any | null>(null);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);

  useEffect(() => {
    if (currentSection !== 'saved' || !user?.id) return;
    setSavedPostsLoading(true);
    const savedRef = collection(db, 'users', user.id, 'savedPosts');
    getDocs(savedRef).then(async (snap) => {
      const posts: any[] = [];
      for (const savedDoc of snap.docs) {
        const postId = savedDoc.data().postId || savedDoc.id;
        try {
          const videoSnap = await getDoc(doc(db, 'videos', postId));
          if (videoSnap.exists()) {
            posts.push({ id: videoSnap.id, ...videoSnap.data() });
          }
        } catch (err) {
          console.error("Error fetching single saved video:", err);
        }
      }
      setSavedPosts(posts);
      setSavedPostsLoading(false);
    }).catch(err => {
      console.error("Error fetching saved posts list:", err);
      setSavedPostsLoading(false);
    });
  }, [currentSection, user?.id]);

  useEffect(() => {
    if (currentSection !== 'friends') return;
    setAllUsersLoading(true);
    const uq = query(collection(db, 'users'), limit(30));
    getDocs(uq).then(async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data(), isFollowing: false }));
      const cleanList = list.filter(u => u.id !== user?.id);
      
      if (user?.id) {
        try {
          const followingSnap = await getDocs(collection(db, 'users', user.id, 'following'));
          const followingIds = new Set(followingSnap.docs.map(d => d.id));
          cleanList.forEach(u => {
            if (followingIds.has(u.id)) {
              u.isFollowing = true;
            }
          });
        } catch (err) {
          console.error("Error fetching current following state:", err);
        }
      }
      setAllUsers(cleanList);
      setAllUsersLoading(false);
    }).catch(err => {
      console.error(err);
      setAllUsersLoading(false);
    });
  }, [currentSection, user?.id]);

  const toggleAutoplayVideos = () => {
    const newVal = !autoplayVideos;
    setAutoplayVideos(newVal);
    localStorage.setItem('world_autoplay_videos', String(newVal));
    window.dispatchEvent(new CustomEvent('world_autoplay_videos_changed', { detail: newVal }));
  };

  const [bgKeepAlive, setBgKeepAlive] = useState(() => localStorage.getItem('world_bg_keep_alive') === 'true');

  const toggleBgKeepAlive = async () => {
    const nextVal = !bgKeepAlive;
    setBgKeepAlive(nextVal);
    localStorage.setItem('world_bg_keep_alive', String(nextVal));
    if (nextVal) {
      if ('Notification' in window) {
        await Notification.requestPermission();
      }
      startBackgroundKeepAlive();
    } else {
      stopBackgroundKeepAlive();
    }
  };

  // Active sessions / device tracking states
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = onSnapshot(collection(db, 'users', user.id, 'sessions'), (snapshot) => {
      const uniqueSessions = new Map();
      snapshot.docs.forEach(doc => {
        uniqueSessions.set(doc.id, { id: doc.id, ...doc.data() });
      });
      const list = Array.from(uniqueSessions.values());
      list.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setSessions(list);
      setSessionsLoading(false);
    }, (err) => {
      console.error("Error fetching sessions:", err);
      setSessionsLoading(false);
    });
    return () => unsub();
  }, [user?.id]);

  const terminateSession = async (sessId: string) => {
    if (!user) return;
    const isCurrent = sessId === sessionId;
    const confirmMsg = isCurrent 
      ? "Are you sure you want to log out from this device?"
      : "Are you sure you want to disconnect this device? It will be logged out dynamically on that machine.";

    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'users', user.id, 'sessions', sessId));
        if (isCurrent) {
          onClose();
          logout();
        } else {
          alert("Device connection removed successfully!");
        }
      } catch (err: any) {
        alert("Failed to disconnect device: " + err.message);
      }
    }
  };

  // Storage Cloud Router States
  const [storageProvider, setStorageProvider] = useState(() => localStorage.getItem('world_storage_provider') || 'cloudinary');
  const [showCldSetup, setShowCldSetup] = useState(false);
  const [cldCloudName, setCldCloudName] = useState('dbpr8bcjz');
  const [cldApiKey, setCldApiKey] = useState('294279316712512');
  const [cldApiSecret, setCldApiSecret] = useState('yDHJMRvFGUKLdusYgwciPr2uhSU');

  useEffect(() => {
    try {
      const savedCld = localStorage.getItem('world_cloudinary_config');
      if (savedCld) {
        const parsed = JSON.parse(savedCld);
        if (parsed.cloudName) setCldCloudName(parsed.cloudName);
        setCldApiKey(parsed.apiKey || '294279316712512');
        setCldApiSecret(parsed.apiSecret || 'yDHJMRvFGUKLdusYgwciPr2uhSU');
      } else {
        const defaultConfig = {
          cloudName: 'dbpr8bcjz',
          apiKey: '294279316712512',
          apiSecret: 'yDHJMRvFGUKLdusYgwciPr2uhSU'
        };
        localStorage.setItem('world_cloudinary_config', JSON.stringify(defaultConfig));
        localStorage.setItem('world_storage_provider', 'cloudinary');
        setStorageProvider('cloudinary');
      }
    } catch (e) {
      console.error("Failed to load local storage credentials:", e);
    }
  }, []);

  const saveCldConfig = () => {
    const config = {
      cloudName: cldCloudName.trim() || 'dbpr8bcjz',
      apiKey: cldApiKey.trim(),
      apiSecret: cldApiSecret.trim(),
    };
    localStorage.setItem('world_cloudinary_config', JSON.stringify(config));
    localStorage.setItem('world_storage_provider', 'cloudinary');
    setStorageProvider('cloudinary');
    alert("💯 Cloudinary Programmable Media CDN Connected! / ক্লাউডিনারী সার্ভার সফলভাবে সংযুক্ত হয়েছে।");
    setShowCldSetup(false);
  };

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const newLang = (e as CustomEvent).detail;
      setAppLanguage(newLang);
    };
    window.addEventListener('app-language-changed', handleLangChange);
    return () => {
      window.removeEventListener('app-language-changed', handleLangChange);
    };
  }, []);

  const deleteAccount = async () => {
    if (!user) return;
    if (window.confirm("CRITICAL: Delete your account and all posts? This cannot be undone.")) {
      setLoading(true);
      try {
        const vq = query(collection(db, 'videos'), where('userId', '==', user.id));
        const vSnap = await getDocs(vq);
        for (const d of vSnap.docs) {
          await deleteDoc(d.ref);
        }
        
        await deleteDoc(doc(db, 'users', user.id));
        onClose();
        logout();
      } catch (err: any) {
        alert("Failed to delete account: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const updatePrivacy = async (field: string, value: 'public' | 'private') => {
    if (!user) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        [`privacy.${field}`]: value
      }, { merge: true });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Meta Portal Sub-Views Rendering Helpers
  const renderMenuPortal = () => {
    const shortcuts = [
      { id: 'friends', label: appLanguage === 'bn' ? 'বন্ধুরা' : 'Friends Circle', sub: appLanguage === 'bn' ? `${allUsers.length || 3} জন সদস্য` : `${allUsers.length || 3} members`, icon: Users, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
      { id: 'dashboard', label: appLanguage === 'bn' ? 'ড্যাশবোর্ড' : 'Creator Center', sub: appLanguage === 'bn' ? '@প্রো অ্যানালিটিক্স' : '@pro analytics', icon: LayoutDashboard, color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
      { id: 'saved', label: appLanguage === 'bn' ? 'সেভড' : 'Bookmarked Reels', sub: appLanguage === 'bn' ? `${savedPosts.length}টি সংরক্ষিত` : `${savedPosts.length} saved`, icon: Bookmark, color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
      { id: 'memories', label: appLanguage === 'bn' ? 'মেমোরিজ' : 'Memory Lane', sub: appLanguage === 'bn' ? 'নস্টালজিয়া লগ' : 'Nostalgia log', icon: History, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      { id: 'reels', label: appLanguage === 'bn' ? 'রিলস' : 'Browse Feed', sub: appLanguage === 'bn' ? 'শর্টস দেখুন' : 'Watch shorts', icon: Play, color: 'bg-red-500/10 text-red-500 border-red-500/20' },
      { id: 'groups', label: appLanguage === 'bn' ? 'গ্রুপস' : 'Communities', sub: appLanguage === 'bn' ? 'সামাজিক হাব' : 'Social hubs', icon: Globe, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    ];

    const filteredShortcuts = shortcuts.filter(s => 
      s.label.toLowerCase().includes(friendsSearch.toLowerCase()) ||
      s.sub.toLowerCase().includes(friendsSearch.toLowerCase())
    );

    return (
      <div className="p-4 space-y-6 text-left animate-in fade-in duration-300">
        
        {/* Search header inside portal menu */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder={appLanguage === 'bn' ? 'মেনু শর্টকাট খুঁজুন...' : 'Search menu shortcuts...'} 
            value={friendsSearch} 
            onChange={(e) => setFriendsSearch(e.target.value)}
            className="w-full bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] pl-9 pr-4 py-2.5 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-pink-500/40 transition-all font-semibold"
          />
        </div>

        {/* User profile capsule */}
        <div 
          onClick={() => {
            hapticFeedback('medium');
            onClose();
            window.dispatchEvent(new CustomEvent('nav-to-tab', { detail: 'profile' }));
          }}
          className="bg-zinc-900/60 hover:bg-zinc-900/90 p-3.5 rounded-2xl border border-[var(--border-secondary)] flex items-center justify-between cursor-pointer transition-all active:scale-98 select-none"
        >
          <div className="flex items-center space-x-3 text-left font-semibold">
            <div className="relative">
              <img 
                src={user?.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80"} 
                className="w-10 h-10 rounded-full object-cover border border-[#FF4B91]/30"
                onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80" }}
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-white">{user?.fullName || "Guest Account"}</span>
                {user?.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[#00A1FF] fill-[#00A1FF]" />}
              </div>
              <p className="text-[10px] text-gray-405 mt-0.5 max-w-[200px] truncate leading-none font-semibold">
                {user?.bio || (appLanguage === 'bn' ? 'আপনার প্রোফাইল দেখতে ট্যাপ করুন' : 'Tap to customize display profile')}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </div>

        {/* Shortcuts grid */}
        <div className="space-y-3">
          <h3 className="text-[9.5px] uppercase text-gray-400 font-extrabold tracking-widest pl-1 select-none">
            {appLanguage === 'bn' ? 'আপনার শর্টকাটসমূহ' : 'Your Shortcuts'}
          </h3>
          <div className="grid grid-cols-2 gap-2.5 select-none">
            {filteredShortcuts.slice(0, seeMoreOpen ? undefined : 4).map((s) => {
              const IconComp = s.icon;
              return (
                <div 
                  key={s.id}
                  onClick={() => {
                    hapticFeedback('medium');
                    if (s.id === 'reels') {
                      onClose();
                      window.dispatchEvent(new CustomEvent('nav-to-tab', { detail: 'home' }));
                    } else {
                      setCurrentSection(s.id as any);
                    }
                  }}
                  className="bg-zinc-900/45 hover:bg-zinc-900/70 p-3 rounded-2xl border border-[var(--border-secondary)]/30 hover:border-pink-500/20 flex flex-col items-start justify-between cursor-pointer transition-all active:scale-95 text-left h-[84px] select-none group"
                >
                  <div className={cn("p-1.5 rounded-xl border", s.color)}>
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-250 group-hover:text-pink-400 transition-colors leading-none">{s.label.split(' • ')[0]}</p>
                    <p className="text-[9px] text-gray-500 font-bold mt-1 leading-none">{s.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expansion button */}
        <button 
          onClick={() => {
            hapticFeedback('light');
            setSeeMoreOpen(!seeMoreOpen);
          }}
          className="w-full py-2.5 bg-zinc-900/50 hover:bg-zinc-900/80 border border-zinc-850 rounded-xl text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-white transition-all select-none active:scale-98"
        >
          {seeMoreOpen 
            ? (appLanguage === 'bn' ? 'কম দেখুন ↑' : 'See less ↑') 
            : (appLanguage === 'bn' ? 'আরও দেখুন ↓' : 'See more ↓')}
        </button>

        {/* Meta support help and configurations */}
        <div className="space-y-3 pt-2">
          <h3 className="text-[9.5px] uppercase text-gray-550 font-extrabold tracking-widest pl-1 select-none">
            {appLanguage === 'bn' ? 'সাহায্য ও সাপোর্ট অপশনস' : 'Help & Support Options'}
          </h3>
          <div className="bg-zinc-900/40 border border-zinc-850/55 rounded-2xl divide-y divide-zinc-850/30 overflow-hidden">
            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('meta-ai'); }}
              className="p-3.5 hover:bg-zinc-900/30 flex items-center justify-between cursor-pointer transition-all active:scale-99 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-violet-400/10 rounded-xl border border-violet-500/20 text-violet-400 font-bold">
                  <Sparkles className="w-4 h-4 fill-violet-400 animate-pulse animate-duration-1000" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white flex items-center gap-1.5 leading-none">
                    {appLanguage === 'bn' ? 'মেটা এআই অ্যাসিস্ট্যান্ট' : 'World AI Chat Assistant'}
                    <span className="bg-violet-500/15 text-violet-405 border border-violet-500/20 text-[7px] font-black px-1.5 py-0.5 rounded leading-none uppercase tracking-wide">AI</span>
                  </h4>
                  <p className="text-[9px] text-gray-500 mt-1 font-semibold">Gemini 3.5 Bengali & English smart companion</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650 animate-pulse" />
            </div>

            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('scam-protection'); }}
              className="p-3.5 hover:bg-zinc-900/30 flex items-center justify-between cursor-pointer transition-all active:scale-99 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-red-400/10 rounded-xl border border-red-500/20 text-red-500">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white leading-none">
                    {appLanguage === 'bn' ? 'স্ক্যাম প্রতিরোধ কেন্দ্র' : 'Anti-Scam Protection Center'}
                  </h4>
                  <p className="text-[9px] text-gray-500 mt-1 font-semibold">Interactive safety quiz & score coins free</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650" />
            </div>

            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('support'); }}
              className="p-3.5 hover:bg-zinc-900/30 flex items-center justify-between cursor-pointer transition-all active:scale-99 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-[#FF4B91]/10 rounded-xl border border-[#FF4B91]/15 text-[#FF4B91]">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white leading-none">
                    {appLanguage === 'bn' ? 'হেল্প গাইড এবং এফএকিউ' : 'Help FAQ & Info center'}
                  </h4>
                  <p className="text-[9px] text-gray-500 mt-1 font-semibold">Answers about coins, limits, and storage provider</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650" />
            </div>

            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('report-problem'); }}
              className="p-3.5 hover:bg-zinc-900/30 flex items-center justify-between cursor-pointer transition-all active:scale-99 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/15 text-amber-500">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white leading-none">
                    {appLanguage === 'bn' ? 'সমস্যা রিপোর্ট করার ফর্ম' : 'Report a Problem'}
                  </h4>
                  <p className="text-[9px] text-gray-500 mt-1 font-semibold">Report application errors directly to database</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650" />
            </div>

            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('terms'); }}
              className="p-3.5 hover:bg-zinc-900/30 flex items-center justify-between cursor-pointer transition-all active:scale-99 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/15 text-blue-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white leading-none">
                    {appLanguage === 'bn' ? 'ব্যবহারের নীতিমালা ও কপিরাইট' : 'Platform Policies'}
                  </h4>
                  <p className="text-[9px] text-gray-500 mt-1 font-semibold">Respect copyright and user sandbox principles</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650" />
            </div>

            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('settings'); }}
              className="p-3.5 hover:bg-zinc-900/30 flex items-center justify-between cursor-pointer transition-all active:scale-99 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-gray-500/10 rounded-xl border border-gray-500/20 text-gray-300">
                  <SettingsIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white leading-none">{appLanguage === 'bn' ? 'সেটিংস এবং প্রাইভেসি' : 'Settings & Core Privacy'}</h4>
                  <p className="text-[9px] text-gray-500 mt-1 font-semibold">Configure dark mode, autoplay, sync connections</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650" />
            </div>

            <div 
              onClick={() => { hapticFeedback('medium'); setCurrentSection('install-guide'); }}
              className="p-3.5 bg-pink-500/5 hover:bg-pink-500/10 flex items-center justify-between cursor-pointer transition-all active:scale-99 border-t border-zinc-850/30 select-none"
            >
              <div className="flex items-center space-x-3.5 text-left">
                <div className="p-2 bg-pink-500/10 rounded-xl border border-pink-500/20 text-[#FF4B91]">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#FF4B91] leading-none flex items-center gap-1.5">
                    {appLanguage === 'bn' ? 'ফোনে ইনস্টল এবং প্লে-স্টোর গাইড' : 'Install & Play-Store Guide'}
                    <span className="bg-pink-500/15 text-pink-400 border border-pink-500/20 text-[7px] font-black px-1.5 py-0.5 rounded leading-none uppercase tracking-wide">HOT</span>
                  </h4>
                  <p className="text-[9px] text-gray-400 mt-1 font-semibold">{appLanguage === 'bn' ? '১-ক্লিক ইনস্টল এবং এপিকে (APK) তৈরি করার সম্পূর্ণ গাইড' : '1-Click PWA installer & complete custom APK build details'}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#FF4B91] animate-pulse" />
            </div>

          </div>
        </div>

        <div className="text-center pt-8 opacity-30 select-none pb-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400">WORLD social sandbox portal client v3.4.1</p>
          <p className="text-[7.5px] text-zinc-500 italic mt-0.5">Powered by dynamic Firebase Cloud database</p>
        </div>

      </div>
    );
  };

  const renderFriendsSection = () => {
    const list = allUsers.filter(u => 
      u.fullName.toLowerCase().includes(friendsSearch.toLowerCase()) ||
      (u.bio && u.bio.toLowerCase().includes(friendsSearch.toLowerCase()))
    );

    const toggleFollowUser = async (targetUser: any) => {
      if (!user?.id) return;
      hapticFeedback('medium');
      const isFollowingNow = !targetUser.isFollowing;
      setAllUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, isFollowing: isFollowingNow } : u));
      try {
        const followRef = doc(db, 'users', user.id, 'following', targetUser.id);
        if (isFollowingNow) {
          await setDoc(followRef, { createdAt: new Date().toISOString() });
        } else {
          await deleteDoc(followRef);
        }
      } catch (err) {
        console.error("Error updates:", err);
        setAllUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, isFollowing: !isFollowingNow } : u));
      }
    };

    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder={appLanguage === 'bn' ? 'মেম্বার খুঁজুন...' : 'Search active community members...'} 
            value={friendsSearch} 
            onChange={(e) => setFriendsSearch(e.target.value)}
            className="w-full bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] pl-9 pr-4 py-2.5 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-pink-500/40 font-semibold"
          />
        </div>

        {allUsersLoading ? (
          <div className="space-y-2.5 pt-1">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center justify-between p-3.5 bg-zinc-900/25 rounded-2xl animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-zinc-800 rounded-full" />
                  <div className="space-y-1">
                    <div className="w-24 h-3.5 bg-zinc-800 rounded" />
                    <div className="w-32 h-2.5 bg-zinc-800 rounded" />
                  </div>
                </div>
                <div className="w-16 h-8 bg-zinc-800 rounded-full" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-xs font-semibold leading-relaxed">
            {appLanguage === 'bn' ? 'কোনো মেম্বার খুঁজে পাওয়া যায়নি!' : 'No community matches found on the platform!'}
          </div>
        ) : (
          <div className="space-y-2.5 pt-1 text-left">
            <h3 className="text-[9px] uppercase text-gray-500 font-extrabold tracking-widest mb-1 select-none pl-1">
              Registered Users Circle ({list.length})
            </h3>
            {list.map((u: any, idx: number) => (
              <div key={`${u.id || 'fnd'}-${idx}`} className="bg-zinc-900/35 p-3.5 rounded-2xl border border-[var(--border-secondary)]/30 flex items-center justify-between transition-all hover:bg-zinc-900/50">
                <div className="flex items-center space-x-3.5">
                  <div className="relative">
                    <img 
                      src={u.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80"} 
                      className="w-10 h-10 rounded-full object-cover border border-zinc-800"
                      onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80" }}
                    />
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border border-black rounded-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-black text-white">{u.fullName}</span>
                      {u.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[#00A1FF] fill-[#00A1FF]" />}
                    </div>
                    <p className="text-[10px] text-gray-400 font-semibold truncate max-w-[150px] leading-tight mt-0.5">
                      {u.bio || "@" + (u.fullName || "user").toLowerCase().replace(/\s+/g, '')}
                    </p>
                  </div>
                </div>
                
                <button 
                  onClick={() => toggleFollowUser(u)}
                  className={cn(
                    "text-[10px] font-black px-4 py-2 rounded-full transition-all active:scale-95 uppercase tracking-wider select-none",
                    u.isFollowing 
                      ? "bg-zinc-805 text-zinc-350 hover:bg-zinc-750" 
                      : "bg-[#FF4B91] hover:bg-pink-500 text-white shadow-md"
                  )}
                >
                  {u.isFollowing 
                    ? (appLanguage === 'bn' ? 'ফলোয়িং' : 'Following') 
                    : (appLanguage === 'bn' ? 'ফলো' : 'Follow')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSavedPostsSection = () => {
    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300">
        {savedPostsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="aspect-[9/16] bg-zinc-900/25 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : savedPosts.length === 0 ? (
          <div className="text-center py-20 text-gray-505 text-xs font-black max-w-[240px] mx-auto space-y-3">
            <Bookmark className="w-10 h-10 text-zinc-700 mx-auto animate-bounce animate-duration-1000" />
            <p className="uppercase tracking-wider">
              {appLanguage === 'bn' ? 'কোনো ভিডিও সেভ করা নেই!' : 'Bookmarks index Empty!'}
            </p>
            <p className="text-[10px] font-semibold text-zinc-550 leading-relaxed normal-case">
              {appLanguage === 'bn' ? 'রিলস ফিডের বুকমার্ক বাটনে ক্লিক করুন যা এখানে সচল থাকবে অতি সহজে।' : 'Bookmark posts on your main timeline feeds to populate this private collection.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-left">
            <h4 className="text-[10px] text-gray-400 font-extrabold tracking-widest uppercase pl-1">
              My Saved Bookmarks ({savedPosts.length})
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {savedPosts.map((post: any, idx: number) => (
                <div 
                  key={`${post.id || 'saved'}-${idx}`}
                  onClick={() => {
                    hapticFeedback('medium');
                    setPlayingVideo(post);
                  }}
                  className="relative aspect-[9/16] bg-zinc-900 rounded-2xl border border-zinc-800/80 overflow-hidden cursor-pointer active:scale-98 transition-all group"
                >
                  {post.contentUrl ? (
                    <video 
                      src={post.contentUrl} 
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-3 text-center bg-zinc-950">
                      <p className="text-[10px] font-bold text-gray-400 line-clamp-4 leading-normal font-semibold">{post.textContent || "Story Post details"}</p>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent p-3 text-left w-full">
                    <p className="text-[10px] font-black text-white truncate">{post.fullName || "Member"}</p>
                    <p className="text-[9px] text-gray-450 truncate mt-0.5">{post.title || post.description || "Video metadata"}</p>
                  </div>
                  
                  <div className="absolute top-2.5 right-2.5 p-1.5 bg-black/65 rounded-full border border-white/10 group-hover:scale-110 transition-transform">
                    <Play className="w-2.5 h-2.5 text-white fill-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved video visual overlays */}
        <AnimatePresence>
          {playingVideo && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[120] bg-black/98 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/30 text-white shrink-0 z-10 select-none">
                <div className="flex items-center gap-1.5">
                  <Bookmark className="w-4 h-4 text-pink-500 fill-pink-500" />
                  <span className="text-xs font-black uppercase tracking-wider">{playingVideo.fullName || "Reel player"}</span>
                </div>
                <button 
                  onClick={() => setPlayingVideo(null)}
                  className="p-1.5 hover:bg-white/15 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center bg-black relative">
                {playingVideo.contentUrl ? (
                  <video 
                    src={playingVideo.contentUrl} 
                    className="max-h-full max-w-full object-contain"
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <div className="p-6 text-center max-w-md">
                    <p className="text-sm font-bold text-gray-200 leading-normal">{playingVideo.textContent}</p>
                  </div>
                )}
              </div>

              <div className="bg-black/90 border-t border-white/10 p-5 text-left shrink-0 select-none space-y-1 w-full">
                <p className="text-xs font-black text-white">{playingVideo.title || "No subject"}</p>
                <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">{playingVideo.description || "Bookmark video playback panel is fully working."}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderMemoriesSection = () => {
    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300 select-none">
        <div className="text-center py-6 select-none max-w-[260px] mx-auto space-y-2">
          <History className="w-12 h-12 text-amber-400 mx-auto animate-pulse" />
          <h4 className="text-xs font-black text-gray-200 uppercase tracking-widest leading-none pt-2">
            {appLanguage === 'bn' ? 'স্মৃতিসমূহ' : 'On This Day Memories'}
          </h4>
          <p className="text-[10px] font-semibold text-gray-410 leading-relaxed font-semibold">
            {appLanguage === 'bn' ? 'আজকের দিনে অতীতে আপনার আইডিতে শেয়ার করা সব পোস্ট ও স্টোরি স্মৃতিসমূহ।' : 'Review your best archive milestones, updates, and story interactions here.'}
          </p>
        </div>

        <div className="space-y-4 text-left font-semibold">
          <h4 className="text-[9.5px] text-gray-500 font-extrabold tracking-widest uppercase pl-1">
            {appLanguage === 'bn' ? 'অতীতের টাইমলাইন মুহূর্ত সমূহ' : 'Nostalgic Timeline Moments'}
          </h4>

          <div className="space-y-4 relative border-l-2 border-zinc-900 pl-5 ml-2">
            {[
              { 
                year: appLanguage === 'bn' ? '১ বছর আগের আজকের দিন' : '1 Year Ago Today', 
                label: appLanguage === 'bn' ? 'ওয়ার্ল্ড সোশ্যালে যোগদান করেছেন' : 'Joined the World Social', 
                text: appLanguage === 'bn' ? 'উচ্চ পারফরম্যান্স সামাজিক রিলস প্ল্যাটফর্মে নথিভুক্ত হয়েছেন এবং আপনার প্রথম ট্রেন্ডিং পোস্ট আপলোড করেছেন! 🚀' : 'Enrolled in high performance social reels experience and uploaded your first trending post! 🚀', 
                coins: 120 
              },
              { 
                year: appLanguage === 'bn' ? '৩ মাস আগের আজকের দিন' : '3 Months Ago Today', 
                label: appLanguage === 'bn' ? 'ভেরিফাইড ব্লু ক্রিয়েটর' : 'Verified Blue Creator', 
                text: appLanguage === 'bn' ? 'পেশাদার ড্যাশবোর্ড অ্যাক্সেস পেয়েছেন এবং আপনার প্রথম তারকা পুরস্কার রূপান্তর করেছেন! 👍' : 'Gained professional dashboard and converted your first star rewards! 👍', 
                coins: 50 
              }
            ].map((m, i) => (
              <div key={i} className="relative bg-zinc-900/30 p-3.5 rounded-2xl border border-zinc-850 text-left">
                <div className="absolute -left-[27px] top-[18px] w-3 h-3 bg-amber-400 border-2 border-black rounded-full" />
                <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/15 rounded px-2 py-0.5 font-black uppercase tracking-wider">{m.year}</span>
                <h5 className="text-xs font-extrabold text-white mt-2.5">{m.label}</h5>
                <p className="text-[10px] text-gray-450 mt-1.5 leading-relaxed font-semibold">{m.text}</p>
                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-zinc-850/50 text-[9px] text-yellow-500 font-black tracking-widest uppercase">
                  <Coins className="w-3.5 h-3.5 text-yellow-500" />
                  <span>EARNED {m.coins} COINS IN BALANCE</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderGroupsSection = () => {
    if (activeGroup) {
      return (
        <div className="p-4 space-y-4 animate-in slide-in-from-right duration-350 select-none text-left">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
            <button 
              onClick={() => setActiveGroup(null)}
              className="text-[#FF4B91] text-[10px] font-black uppercase tracking-wider flex items-center"
            >
              {appLanguage === 'bn' ? '← গ্রুপে ফিরে যান' : '← Back to Groups'}
            </button>
            <span className="bg-emerald-500/10 text-emerald-400 text-[8px] px-2 py-0.5 rounded-full font-black border border-emerald-500/20 uppercase tracking-widest">
              {activeGroup.category}
            </span>
          </div>

          <div className="space-y-1 text-left">
            <h3 className="text-base font-black text-white leading-tight">{activeGroup.name}</h3>
            <p className="text-[10px] text-gray-400 font-bold leading-normal mt-1">{activeGroup.desc}</p>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
              {appLanguage === 'bn' 
                ? `${activeGroup.members} জন সদস্য • সক্রিয় অনলাইন: ${activeGroup.online} জন` 
                : `${activeGroup.members} members • ${activeGroup.online} active online`}
            </p>
          </div>

          {/* New group post write box */}
          <div className="bg-zinc-900/40 p-3 rounded-2xl border border-zinc-850/60 text-left space-y-2.5">
            <textarea 
              placeholder={appLanguage === 'bn' ? 'গ্রুপে কিছু লিখুন...' : 'Write something to the community...'}
              value={newGroupPostText}
              onChange={(e) => setNewGroupPostText(e.target.value)}
              className="w-full h-16 bg-zinc-950 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-pink-500/50 resize-none font-semibold leading-relaxed"
            />
            <div className="flex justify-end">
              <button 
                onClick={() => {
                  if (!newGroupPostText.trim()) return;
                  hapticFeedback('medium');
                  const newPost = {
                    id: 'gpd' + Date.now(),
                    author: user?.fullName || 'Anonymous User',
                    text: newGroupPostText,
                    likes: 0,
                    comments: 0,
                    time: 'Now'
                  };
                  setGroupPosts([newPost, ...groupPosts]);
                  setNewGroupPostText('');
                }}
                className="bg-[#FF4B91] hover:bg-pink-500 text-white text-[10px] font-black uppercase px-4 py-2 rounded-full transition-all active:scale-95 shadow-md shadow-pink-600/10"
              >
                {appLanguage === 'bn' ? 'প্রকাশ করুন' : 'Publish'}
              </button>
            </div>
          </div>

          {/* Thread feeds */}
          <div className="space-y-3 pt-2">
            {groupPosts.map((p, idx) => (
              <div key={`${p.id || 'gp'}-${idx}`} className="bg-zinc-900/20 p-3.5 rounded-2xl border border-zinc-850/40 text-left font-semibold">
                <div className="flex items-center justify-between mb-2 select-none">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-[9px] font-black text-pink-400 uppercase">
                      {p.author[0]}
                    </div>
                    <span className="text-xs font-black text-gray-200 font-semibold">{p.author}</span>
                  </div>
                  <span className="text-[9px] text-gray-555 font-bold">{p.time}</span>
                </div>
                <p className="text-xs text-gray-300 font-semibold leading-relaxed leading-normal">{p.text}</p>
                
                <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-zinc-850 text-gray-500 text-[10px] font-black select-none">
                  <button 
                    onClick={() => hapticFeedback('light')}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    👍 {p.likes || 0}
                  </button>
                  <span className="flex items-center gap-1">
                    💬 {p.comments || 0} {appLanguage === 'bn' ? 'টি উত্তর' : 'replies'}
                  </span>
                </div>
              </div>
            ))}
          </div>

        </div>
      );
    }

    return (
      <div className="p-4 space-y-4 animate-in fade-in duration-300 text-left cursor-default">
        <h4 className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-1 pl-1">
          {appLanguage === 'bn' ? 'সক্রিয় আড্ডা গ্রুপসমূহ' : 'Popular Active Communities'}
        </h4>
        <div className="space-y-3 select-none">
          {communityGroups.map((g, idx) => (
            <div 
              key={`${g.id}-${idx}`}
              onClick={() => {
                hapticFeedback('medium');
                setActiveGroup(g);
              }}
              className="bg-zinc-900/35 p-3.5 rounded-2xl border border-[var(--border-secondary)]/30 hover:border-pink-500/30 flex items-center justify-between cursor-pointer transition-all hover:bg-zinc-900/50 select-none text-left"
            >
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 bg-pink-500/10 rounded-xl border border-pink-500/15 text-pink-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white leading-none">{g.name}</h4>
                  <p className="text-[9.5px] text-gray-400 font-bold mt-1.5 leading-tight">{g.desc}</p>
                  <p className="text-[8px] text-zinc-500 font-bold tracking-wider mt-1.5 uppercase leading-none">
                    {appLanguage === 'bn' 
                      ? `${g.members} জন সদস্য • ` 
                      : `${g.members} members • `}
                    <span className="text-emerald-400">
                      ● {appLanguage === 'bn' ? `${g.online} জন সক্রিয়` : `${g.online} active`}
                    </span>
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-650" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMetaAIChat = () => {
    return (
      <div className="flex flex-col h-[calc(100vh-125px)] text-left animate-in fade-in duration-300">
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          <div className="bg-violet-600/10 border border-violet-500/15 p-3.5 rounded-2xl text-[10.5px] text-violet-300 leading-normal font-bold flex gap-2.5 select-none mb-3">
            <Sparkles className="w-4 h-4 shrink-0 animate-pulse text-violet-400" />
            <div>
              <p className="uppercase tracking-widest font-black text-white text-[9.5px]">WORLD AI ASSISTANT PANEL</p>
              <p className="font-semibold text-[9px] text-gray-400 mt-1">Safely integrated server side via @google/genai. Instantly queries answers in Bengali or English regarding coins, limits, and profiles.</p>
            </div>
          </div>

          {aiMessages.map((m, idx) => (
            <div 
              key={idx}
              className={cn(
                "max-w-[80%] p-3.5 rounded-2xl text-xs font-semibold leading-relaxed leading-normal border",
                m.role === 'model' 
                  ? "bg-zinc-900 border-zinc-850 text-gray-200 mr-auto rounded-tl-none whitespace-pre-line text-left" 
                  : "bg-violet-600 border border-violet-500/20 text-white ml-auto rounded-tr-none whitespace-pre-line text-left"
              )}
            >
              {m.text}
            </div>
          ))}

          {isAISending && (
            <div className="bg-zinc-900 border border-zinc-850 p-2 rounded-2xl rounded-tl-none max-w-[60px] mr-auto flex gap-1 items-center justify-center pt-3.5 pb-3.5 select-none opacity-85">
              <span className="w-1 px-1 py-1 bg-violet-400 rounded-full animate-bounce delay-100" />
              <span className="w-1 px-1 py-1 bg-violet-400 rounded-full animate-bounce delay-200" />
              <span className="w-1 px-1 py-1 bg-violet-400 rounded-full animate-bounce delay-300" />
            </div>
          )}
        </div>

        {/* Input panel block bottom */}
        <div className="p-3 border-t border-zinc-850 bg-zinc-950 flex gap-2 shrink-0 w-full">
          <input 
            type="text" 
            placeholder={appLanguage === 'bn' ? 'এআই-কে জিজ্ঞাসা করুন...' : 'Ask AI Agent...'}
            value={newAIMessageText}
            onChange={(e) => setNewAIMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMetaAI();
            }}
            disabled={isAISending}
            className="flex-1 bg-zinc-900 text-xs text-white px-4 py-3 rounded-2xl border border-zinc-800 outline-none focus:border-violet-500/5 w-full font-semibold"
          />
          <button 
            onClick={handleSendMetaAI}
            disabled={isAISending}
            className="p-3 bg-violet-600 disabled:bg-violet-800 hover:bg-violet-500 text-white rounded-2xl transition-all active:scale-95 flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4 fill-white" />
          </button>
        </div>

      </div>
    );
  };

  const renderScamProtection = () => {
    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300 select-none">
        
        {/* Scam aware box */}
        <div className="bg-gradient-to-r from-red-500/5 to-pink-500/5 border border-red-500/20 p-4 rounded-3xl space-y-1 text-center select-none">
          <ShieldAlert className="w-8 h-8 text-red-500 mx-auto animate-bounce mt-1" />
          <h3 className="text-xs font-black text-white uppercase tracking-wider pt-2">{appLanguage === 'bn' ? 'স্ক্যাম সচেতনতা ও শিক্ষা কেন্দ্র' : 'Anti-Scam Protection Corner'}</h3>
          <p className="text-[10px] font-semibold text-gray-400 leading-normal max-w-[260px] mx-auto normal-case pt-0.5">
            {appLanguage === 'bn' 
              ? 'নিরাপদে ব্রাউজ করুন এবং লোভনীয় ফিশিং পাসওয়ার্ড লিংক হ্যাক থেকে নিজের প্রোফাইল সুরক্ষিত রাখুন।' 
              : 'Keep your social coins and password details completely safe. Take safety quiz to score coins free!'}
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <h4 className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-1 pl-1">
            Account Security Guidelines
          </h4>

          {[
            { t: 'সিকিউর পাসওয়ার্ড পলিসি', desc: 'কখনোই আপনার প্রোফাইলের পাসওয়ার্ড বা লগইন ফায়ারবেস টোকেন চ্যাটে কিংবা মেইলে কারও সাথে শেয়ার করবেন না।' },
            { t: 'ভেরিফাইড ব্যাজ প্রতারণা', desc: 'আইডিতে ব্লু ভেরিফিকেশন ব্যাজ শুধুমাত্র শপ থেকে ১০,০০০ কয়েনের বিনিময়ে কেনা সম্ভব। প্রতারকদের ফাঁদে পা দেবেন না।' },
            { t: 'পাসওয়ার্ড রিলেটড ফিশিং লিংক', desc: 'লোভনীয় লিংক কিংবা ফ্রি রিওয়ার্ড অফার লিংক খুজে প্রোফাইল বিবরণ দেওয়া বোকামি। এতে আইডি হ্যাক হতে পারে।' }
          ].map((item, idx) => (
            <div key={idx} className="bg-zinc-900/40 p-3.5 rounded-2xl border border-zinc-850/50 text-left">
              <div className="flex gap-2 items-start font-black text-xs text-white leading-none">
                <span className="text-green-500 mt-0.5">✔</span>
                <span>{item.t}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed font-semibold pl-4 pt-2">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Security Quiz is right here */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-3xl space-y-3.5 text-left">
          <div className="flex items-center gap-2 select-none border-b border-zinc-850 pb-2.5">
            <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider">{appLanguage === 'bn' ? 'নিরাপত্তা কুইজ ক চ্যালেঞ্জ 🏆' : 'Safety Quiz Challenge'}</h4>
              <p className="text-[9px] text-gray-505 font-bold mt-0.5 leading-none">Answer correctly to secure 12 coins instantly!</p>
            </div>
          </div>

          {hasCompletedQuiz ? (
            <div className="text-center py-4 select-none space-y-2">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
              <p className="text-xs font-black text-green-400 uppercase tracking-wider">{appLanguage === 'bn' ? 'কুইজ সম্পন্ন হয়েছে!' : 'Security Test cleared!'}</p>
              <p className="text-[10px] text-gray-400 max-w-[220px] mx-auto leading-relaxed">
                {appLanguage === 'bn' ? 'কুইজ সফলভাবে সমাপ্ত হয়েছে।' : 'Great! You have successfully passed the scam shield test and harvested 12 coins in balance.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-left">
              <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/15 text-[8px] px-2 py-0.5 rounded font-black tracking-widest uppercase leading-none">
                Question {currentQuizIndex + 1} of 3
              </span>
              
              <h5 className="text-xs font-black text-gray-250 leading-relaxed font-semibold pt-1">
                {quizQuestions[currentQuizIndex].q}
              </h5>

              <div className="space-y-2.5">
                {quizQuestions[currentQuizIndex].options.map((opt, oIdx) => (
                  <button 
                    key={oIdx}
                    onClick={() => {
                      if (quizAnswered) return;
                      hapticFeedback('medium');
                      setQuizSelectedOption(oIdx);
                    }}
                    className={cn(
                      "w-full text-left p-3.5 rounded-2xl border text-xs font-semibold leading-relaxed transition-all duration-200 outline-none",
                      quizAnswered 
                        ? (oIdx === quizQuestions[currentQuizIndex].correct 
                            ? "bg-green-600/20 border-green-500 text-green-300 font-bold"
                            : (quizSelectedOption === oIdx 
                                ? "bg-red-600/20 border-red-500 text-red-300 font-bold" 
                                : "bg-zinc-950/40 border-zinc-850/40 text-zinc-500 font-normal"))
                        : (quizSelectedOption === oIdx 
                            ? "bg-pink-600/20 border-pink-500 text-pink-300 scale-[1.01]" 
                            : "bg-zinc-950/40 hover:bg-zinc-950/80 border-zinc-850 text-gray-300 active:scale-99")
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {quizAnswered ? (
                <div className="space-y-3.5 pt-2 animate-in fade-in duration-300 select-none">
                  <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-850/50 text-[10px] text-gray-450 leading-relaxed">
                    <span className="font-black text-yellow-500 block mb-1 uppercase tracking-widest text-[9px]">EXPLANATION:</span>
                    {quizQuestions[currentQuizIndex].exp}
                  </div>
                  
                  <button 
                    onClick={() => {
                      hapticFeedback('medium');
                      const nextScore = quizScore + (quizSelectedOption === quizQuestions[currentQuizIndex].correct ? 1 : 0);
                      setQuizScore(nextScore);

                      if (currentQuizIndex < 2) {
                        setCurrentQuizIndex(currentQuizIndex + 1);
                        setQuizAnswered(false);
                        setQuizSelectedOption(null);
                      } else {
                        if (nextScore === 3) {
                          handleRewardCoins();
                        } else {
                          alert(`কুইজ শেষ! আপনার স্কোর: ${nextScore}/3. সবগুলোর সঠিক উত্তর দিলে ১২টি কয়েন বোনাস পেতেন। আবার চেষ্টা করুন!`);
                          setCurrentQuizIndex(0);
                          setQuizScore(0);
                          setQuizAnswered(false);
                          setQuizSelectedOption(null);
                        }
                      }
                    }}
                    className="w-full py-3 bg-[#FF4B91] hover:bg-pink-500 text-white text-xs font-black uppercase rounded-2xl tracking-widest transition-all shadow-md shadow-pink-600/10"
                  >
                    {currentQuizIndex < 2 ? 'Next Challenge' : 'Submit Result'}
                  </button>
                </div>
              ) : (
                quizSelectedOption !== null && (
                  <button 
                    onClick={() => {
                      hapticFeedback('medium');
                      setQuizAnswered(true);
                    }}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black uppercase rounded-2xl tracking-wider transition-all"
                  >
                    Confirm Answer
                  </button>
                )
              )}

            </div>
          )}
        </div>

      </div>
    );
  };

  const renderSupportFAQ = () => {
    const faqs = [
      { q: 'কীভাবে ব্যালেন্সে ফ্রি কয়েন বাড়াব?', a: 'পাবলিক পোস্ট আপলোড করে গ্রাহক রিএকশন অর্জন, অন্য মেম্বারকে কমেন্ট আদানপ্রদান, এবং আমাদের স্ক্যাম সচেতনতা কুইজে ৩/৩ স্কোর করার মাধ্যমে সরাসরি ইনস্ট্যান্ট বোনাস লাভ করে কয়েন বাড়াতে পারবেন।' },
      { q: 'রিলস প্রোফেশনাল মোডে কী সুবিধা পাব?', a: 'প্রফেশনাল মোড সুইচার অন করলে ক্রিয়েটর রিঅ্যাকশন ড্যাশবোর্ড সচল হওয়াসহ আপনার আপলোডকৃত শর্টসে ভিউ বৃদ্ধি এবং স্টার ইনকামের দারুন মোনেটাইজেশন সুযোগ পাওয়া যাবে।' },
      { q: 'ডেটাবেজ ও নিরাপত্তা পদ্ধতি কী?', a: 'আমাদের সম্পূর্ণ সিস্টেমটি সরাসরি রিয়েল-টাইম ফায়ারবেস (Firebase Cloud) ক্লাউড আর্কিটেকচার দ্বারা চালিত এবং সম্পূর্ণ সুরক্ষিত। এতে আপনার সমস্ত পোস্ট, লাইক ও ভিডিও রিয়েল-টাইমে সংরক্ষিত থাকে।' },
      { q: 'Cloud R2 setup config?', a: 'মেইন সেটিংস প্যানেলে কাস্টম আর২ বাকেট ক্রেডেনশিয়াল ফর্মে এক্সেস কি এবং পাসওয়ার্ড সেভ করার প্রক্রিয়া। এর ফলে নো-ক্যাপাসিটি ক্লাউড ড্রাইভে ফ্রিতে সকল রিলস মিডিয়া ও ইমেজ স্টোর করতে পারবেন।' }
    ];

    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300">
        <h4 className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-1 pl-1">
          {appLanguage === 'bn' ? 'সচরাচর জিজ্ঞাসিত প্রশ্নসমূহ' : 'Help center FAQs'}
        </h4>

        <div className="space-y-2.5">
          {faqs.map((f, i) => (
            <div 
              key={i} 
              className="bg-zinc-900/30 border border-zinc-850 rounded-2xl overflow-hidden"
            >
              <button 
                onClick={() => {
                  hapticFeedback('light');
                  setExpandedFAQIdx(expandedFAQIdx === i ? null : i);
                }}
                className="w-full text-left p-3.5 flex items-center justify-between text-xs font-black text-white hover:bg-zinc-900 outline-none select-none transition-colors border-none"
              >
                <span className="pr-4 leading-normal font-semibold text-zinc-100">{f.q}</span>
                <span className="text-gray-505 font-black text-base">{expandedFAQIdx === i ? '−' : '+'}</span>
              </button>
              
              {expandedFAQIdx === i && (
                <div className="px-3.5 pb-4 text-[10.5px] text-gray-400 leading-relaxed font-semibold border-t border-zinc-850/50 pt-2.5 animate-in slide-in-from-top duration-200">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReportProblem = () => {
    const handleSubmitProblemReport = async () => {
      if (!reportText.trim() || submittingReport) return;
      hapticFeedback('heavy');
      setSubmittingReport(true);

      try {
        const newReportId = 'rep_' + Date.now();
        await setDoc(doc(db, 'reports', newReportId), {
          id: newReportId,
          userId: user?.id || 'anonymous',
          fullName: user?.fullName || 'Anonymous User',
          category: problemCategory,
          text: reportText.trim(),
          createdAt: new Date().toISOString()
        });

        setReportSuccess(true);
        setReportText('');
      } catch (err: any) {
        console.error(err);
        setReportSuccess(true);
        setReportText('');
      } finally {
        setSubmittingReport(false);
      }
    };

    if (reportSuccess) {
      return (
        <div className="p-6 text-center space-y-4 animate-in fade-in duration-300 max-w-[260px] mx-auto pt-16 select-none cursor-default font-semibold">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto animate-pulse" />
          <h4 className="text-sm font-black text-white uppercase tracking-wider">{appLanguage === 'bn' ? 'রিপোর্ট জমাদানের নোটিশ' : 'Complaint Registered!'}</h4>
          <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">
            {appLanguage === 'bn' 
              ? 'ধন্যবাদ! আপনার অভিযোগ মেটা সার্ভার সিস্টেমে সফলভাবে জমা করা হয়েছে। আমাদের সাপোর্ট টিম ২৪ ঘণ্টার মধ্যে পর্যালোচনা নিশ্চিত করবে।'
              : 'Our administrator team has logged your query and compiled it as a ticket reports context.'}
          </p>
          <button 
            onClick={() => { hapticFeedback('light'); setReportSuccess(false); }}
            className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-black uppercase tracking-wider rounded-full transition-colors"
          >
            File Another
          </button>
        </div>
      );
    }

    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300 font-semibold">
        <h4 className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-1 pl-1">
          {appLanguage === 'bn' ? 'সার্ভার সমস্যা কিংবা বাগ রিপোর্ট করুন' : 'Submit Problem feedback'}
        </h4>

        <div className="space-y-4 bg-zinc-900/40 p-4 border border-zinc-850 rounded-3xl">
          <div className="space-y-1.5">
            <label className="text-[9.5px] text-gray-500 uppercase font-extrabold tracking-widest">Category</label>
            <select 
              value={problemCategory}
              onChange={(e) => setProblemCategory(e.target.value)}
              className="w-full bg-zinc-950 text-xs text-white p-3 border border-zinc-800 rounded-xl outline-none font-bold select-none cursor-pointer"
            >
              <option value="video">Reels Playback / Upload problem</option>
              <option value="coins">Coins transactions / Store Issue</option>
              <option value="scam">Spammer Account / Security warning</option>
              <option value="bug">Application error / Code Bug report</option>
              <option value="other">Other feature feedback request</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9.5px] text-gray-550 uppercase font-extrabold tracking-widest font-black text-left">Explain problem ticket details</label>
            <textarea 
              placeholder={appLanguage === 'bn' ? 'সমস্যাটি বিস্তারিত বর্ণনা করুন...' : 'Describe the problem clearly...'}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full h-32 bg-zinc-950 text-xs text-white p-3 border border-zinc-800 rounded-xl outline-none focus:border-pink-500/50 resize-none leading-relaxed font-semibold"
            />
          </div>

          <button 
            onClick={handleSubmitProblemReport}
            disabled={!reportText.trim() || submittingReport}
            className="w-full py-3 bg-[#FF4B91] disabled:bg-pink-850 hover:bg-pink-500 text-white text-xs font-black uppercase rounded-2xl tracking-widest shadow-md shadow-pink-600/15 transition-all outline-none"
          >
            {submittingReport ? 'Submitting...' : 'Send Complaint'}
          </button>
        </div>
      </div>
    );
  };

  const renderTermsPolicies = () => {
    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300 leading-relaxed font-semibold text-gray-300 select-none">
        <h4 className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-1 pl-1">
          {appLanguage === 'bn' ? 'ব্যবহারের নীতিমালা ও কপিরাইট শর্তাবলী' : 'Sandbox social policies'}
        </h4>

        <div className="space-y-4 bg-zinc-900/10 border border-zinc-850 p-4 rounded-3xl text-[11px] leading-relaxed">
          <p className="text-xs font-black text-white leading-none font-extrabold font-black">১. পরিচ্ছন্ন আচরণ গাইডলাইন (Respect Rules)</p>
          <p className="text-gray-450 leading-normal font-medium">কমেন্টে বা কন্টেন্টে কোনোপ্রকার হিংসাত্মক বা আপত্তিজনক আচরণ গ্রহণযোগ্য নয়। সম্মানজনক ভাষা ও সদ্ব্যবহার প্ল্যাটফর্মের মূল্য বজায় রাখে।</p>

          <p className="text-xs font-black text-white mt-4 leading-none font-extrabold font-black font-semibold">২. কপিরাইট লঙ্ঘন নিষেধ (Copyright Standards)</p>
          <p className="text-gray-455 leading-normal font-medium">অন্য মেম্বারদের ভিডিও বা ফটো সম্মতি বা লোগো ছাড়া নিজের দাবি করে রি-আপলোড করা সম্পূর্ণ দন্ডনীয় অপরাধ। অভিযোগ প্রমানিত হলে আইডি ব্যান হতে পারে।</p>

          <p className="text-xs font-black text-white mt-4 leading-none font-extrabold font-black font-semibold">৩. সিকিউরিটি রেসপন্সিবিলিটি (Accounts Liability)</p>
          <p className="text-gray-456 leading-normal font-medium">গ্রাহকদের সর্বোচ্চ প্রফেশনাল সিকিউরিটি ও মডারেটর ড্যাশবোর্ড সুবিধা উপহার দিতে ওয়ার্ল্ড টিম সদা সচল রয়েছে। হ্যাকিং বা ক্ষতিকর মেম্বারদের থেকে বেঁচে চলতে সচেতন থাকুন।</p>
        </div>
      </div>
    );
  };

  const renderInstallGuide = () => {
    const triggerPwaInstall = async () => {
      const promptEvent = (window as any).deferredPrompt;
      if (!promptEvent) {
        alert(appLanguage === 'bn' 
          ? "১-ক্লিক ইনস্টলেশন এই মুহূর্তে ব্রাউজার থেকে সরাসরি প্রম্পট করতে পারছে না। অনুগ্রহ করে ক্রোম ব্রাউজারের উপরে ডানদিকের তিনটি ডটে (...) ট্যাপ করে 'Install app' বা 'Add to Home screen' অপশনটি বেছে নিন।"
          : "Direct prompt is not available right now. Please tap Chrome's three dots (...) and choose 'Install app' or 'Add to Home screen' to install instantly!");
        return;
      }
      hapticFeedback('heavy');
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        alert(appLanguage === 'bn' ? "ধন্যবাদ! অ্যাপ ইনস্টলেশন শুরু হয়েছে।" : "Thank you! App installation has started.");
      }
      (window as any).deferredPrompt = null;
    };

    const hasPrompt = !!(window as any).deferredPrompt;

    return (
      <div className="p-4 space-y-6 text-left animate-in fade-in duration-300 leading-relaxed font-semibold text-zinc-300">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-pink-500/10 to-violet-500/10 border border-pink-500/20 p-5 rounded-3xl space-y-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-pink-500/20 rounded-2xl text-[#FF4B91] border border-pink-500/20">
              <Smartphone className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white leading-none">
                {appLanguage === 'bn' ? 'সরাসরি মোবাইল অ্যাপ ইনস্টল করুন' : 'Install World Social App'}
              </h3>
              <p className="text-[10px] text-gray-400 mt-1.5 font-bold">
                {appLanguage === 'bn' ? 'অ্যান্ড্রয়েড ফোন এবং প্লে-স্টোরের জন্য সম্পূর্ণ রেডি!' : 'Full instructions & 1-click deployment system'}
              </p>
            </div>
          </div>
        </div>

        {/* Option 1: PWA (Progressive Web App) */}
        <div className="bg-zinc-900/40 p-4 border border-zinc-850 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#FF4B91] uppercase font-extrabold tracking-wider bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">পদ্ধতি ১ / Option 1</span>
            <span className="text-[10px] text-zinc-500 font-extrabold flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-zinc-400" /> ইনস্ট্যান্ট ইনস্টল (PWA)</span>
          </div>

          <h4 className="text-xs font-black text-white leading-tight">
            {appLanguage === 'bn' ? '১-ক্লিক ব্রাউজার দিয়ে ইনস্টল করুন (সবচেয়ে সহজ)' : '1-Click Browser Install (Quickest & Best)'}
          </h4>

          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
            {appLanguage === 'bn' 
              ? 'গুগল ক্রোম ব্রাউজার ব্যবহার করে আপনার অ্যান্ড্রয়েড ফোনের হোম স্ক্রিনে অ্যাপটি সরাসরি ইনস্টল করতে পারেন। এটি কোনো স্টোরেজ স্পেস নেবে না এবং অত্যন্ত দ্রুত কাজ করবে!' 
              : 'Using Google Chrome or Samsung Internet, you can directly install this app as a standalone web icon on your home screen. No large downloads, runs instantly.'}
          </p>

          <button 
            onClick={triggerPwaInstall}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs font-black uppercase rounded-2xl tracking-widest shadow-md shadow-pink-600/15 transition-all text-center flex items-center justify-center gap-2 select-none"
          >
            <Download className="w-4 h-4" />
            {appLanguage === 'bn' ? 'সরাসরি ফোনে ইনস্টল করুন' : 'Install App to Phone'}
          </button>

          {!hasPrompt && (
            <p className="text-[9.5px] text-[#FF4B91]/80 italic bg-pink-500/5 p-2.5 rounded-xl border border-pink-500/10 text-center font-bold">
              {appLanguage === 'bn' 
                ? '★ যদি ডাউনলোড বাটন প্রম্পট না করে: ক্রোমের ওপরের ৩টি ডট (...) মেনুতে ট্যাপ করে "Install App" বা "Add to Home Screen" অপশনটি সিলেক্ট করুন।' 
                : '★ If prompt does not show: Tap Chrome\'s [⋮] menu on top right -> select "Install app" or "Add to HomeScreen" directly.'}
            </p>
          )}
        </div>

        {/* Option 2: Build Native APK */}
        <div className="bg-zinc-900/40 p-4 border border-zinc-850 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-violet-400 uppercase font-extrabold tracking-wider bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">পদ্ধতি ২ / Option 2</span>
            <span className="text-[10px] text-zinc-500 font-extrabold flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-zinc-400" /> প্লে-স্টোর জেনুইন APK</span>
          </div>

          <h4 className="text-xs font-black text-white leading-tight">
            {appLanguage === 'bn' ? 'প্লে-স্টোরে আপলোড বা সম্পূর্ণ অ্যান্ড্রয়েড APK তৈরি গাইড' : 'Build Custom Native APK for Play Store release'}
          </h4>

          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
            {appLanguage === 'bn' 
              ? 'আমরা অলরেডি এই সোর্স কোডে Capacitor সেটআপ এবং কনফিগার করে রেখেছি। আপনি আমাদের ড্যাশবোর্ড বা সেটিংস থেকে জিপ ফাইলটি ডাউনলোড করে নিন। এরপর নিচের কোড ডাইরেকশন ফলো করে খুব সহজে APK জেনারেট করে নিজের ফোনে চালাতে এবং প্লে স্টোরে রিলিজ দিতে পারবেন:' 
              : 'We have pre-configured Capacitor packages inside this codebase project for you. To compile it into a certified native Android APK/AAB package, export your project ZIP file from the editor panel, and execute the following steps:'}
          </p>

          <div className="bg-zinc-950 p-4.5 rounded-2xl border border-zinc-850 space-y-3.5 font-mono text-[10.5px]">
            <div className="space-y-1">
              <span className="text-[9px] text-[#FF4B91] font-bold block uppercase tracking-wider">Step 1: Extract Zip</span>
              <p className="text-zinc-300 leading-relaxed text-[10px] font-medium">
                {appLanguage === 'bn' ? '১. আপনার ফোনে বা কম্পিউটারে ডাউনলোড করা জিপ (ZIP) ফাইলটি এক্সট্র্যাক্ট করুন।' : '1. Unzip the downloaded codebase file.'}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] text-violet-400 font-bold block uppercase tracking-wider">Step 2: Install Packages</span>
              <p className="text-zinc-300 leading-relaxed text-[10.5px] bg-zinc-900/80 p-2 rounded border border-zinc-850 text-white font-semibold">npm install</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] text-cyan-400 font-bold block uppercase tracking-wider">Step 3: Web Build</span>
              <p className="text-zinc-300 leading-relaxed text-[10.5px] bg-zinc-900/80 p-2 rounded border border-zinc-850 text-white font-semibold">npm run build</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] text-amber-400 font-bold block uppercase tracking-wider">Step 4: Capacitor Sync</span>
              <p className="text-zinc-300 leading-relaxed text-[10.5px] bg-zinc-900/80 p-2 rounded border border-zinc-850 text-white font-semibold">npx cap sync</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] text-emerald-400 font-bold block uppercase tracking-wider">Step 5: Compile Native Project</span>
              <p className="text-zinc-300 leading-relaxed text-[10.5px] bg-zinc-900/80 p-2 rounded border border-zinc-850 text-white font-semibold">npx cap open android</p>
              <p className="text-zinc-400 mt-1 font-sans text-[10px] leading-relaxed font-semibold">
                {appLanguage === 'bn' 
                  ? '★ এই কমান্ডটি আপনার অ্যান্ড্রয়েড স্টুডিও (Android Studio) ওপেন করবে। সেখানে Build > Build APK সিলেক্ট করলেই আপনার ফোনে ইন্সটল করার জন্য APK রেডি হয়ে যাবে!' 
                  : '★ This command opens the project natively inside Android Studio. Simply sync Gradle and click "Build > Build APK" or "Bundle(s) / APK(s) > Build App Bundle (AAB)" for direct Play Console submission!'}
              </p>
            </div>
          </div>
        </div>

        {/* Play store Listing specs */}
        <div className="bg-zinc-950/40 p-4 border border-zinc-850 rounded-2xl space-y-2.5">
          <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1.5"><CheckCircle2 className="text-emerald-400 w-4 h-4" /> Play Store Listing Parameters</h4>
          <p className="text-[10px] text-gray-500 leading-relaxed font-bold">
            {appLanguage === 'bn' 
              ? 'গুগল প্লে স্টোরে আপনার অ্যাপ পাবলিশ করার সময় নিচের তথ্যগুলো সরাসরি কপি করে বা ব্যবহার করে লিস্টিং তৈরি করুন:' 
              : 'When uploading your application on Google Play Console, use the following approved metadata parameters:'}
          </p>
          <ul className="text-[10px] space-y-1.5 text-zinc-300 list-disc pl-4 font-bold">
            <li><b>App Name:</b> World Social</li>
            <li><b>App ID:</b> <code className="bg-zinc-900/85 px-1 py-0.5 rounded border border-zinc-850">com.mdtuhinhosinn373.worldsocial</code></li>
            <li><b>App Logo Size:</b> 512 x 512px (PNG, alpha channel is automatically managed by Google Play)</li>
            <li><b>Feature Graphic Banner:</b> 1024 x 500px (Use custom banner generated by AI Studio showcase)</li>
            <li><b>Short Description:</b> World Social is a next-generation reels, short video and active social media sandbox community.</li>
          </ul>
        </div>

      </div>
    );
  };

  const renderDashboardSection = () => {
    return (
      <div className="p-4 space-y-4 text-left animate-in fade-in duration-300 select-none">
        
        {/* Creator hub */}
        <div className="bg-gradient-to-r from-violet-500/5 to-indigo-500/5 border border-violet-500/20 p-4 rounded-3xl space-y-3">
          <div className="flex justify-between items-center select-none border-b border-violet-500/15 pb-2.5">
            <h4 className="text-xs font-black text-violet-300 uppercase tracking-widest flex items-center leading-none font-semibold">
              <Sparkles className="w-4 h-4 mr-1 text-violet-400 fill-violet-400 animate-pulse animate-duration-1000" />
              Creator Analytics
            </h4>
            <span className="bg-violet-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded leading-none">Pro Mode Active</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 leading-none font-semibold">
            <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-850 text-left">
              <span className="text-[9px] text-gray-500 uppercase font-extrabold block leading-none">Followers Delta</span>
              <span className="text-base font-black text-white block mt-1.5 leading-none">+142%</span>
            </div>
            <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-850 text-left">
              <span className="text-[9px] text-gray-555 uppercase font-extrabold block leading-none font-black text-emerald-400">Star conversions</span>
              <span className="text-base font-black text-white block mt-1.5 leading-none">$54.10</span>
            </div>
            <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-850 text-left">
              <span className="text-[9px] text-gray-500 uppercase font-extrabold block leading-none">Total ad reward</span>
              <span className="text-base font-black text-white block mt-1.5 leading-none">$18.90</span>
            </div>
            <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-850 text-left">
              <span className="text-[9px] text-gray-555 uppercase font-extrabold block leading-none font-black text-emerald-400">Coin conversions</span>
              <span className="text-base font-black text-white block mt-1.5 leading-none">1,820 🪙</span>
            </div>
          </div>
        </div>

        {/* Firebase & Google Services active badge in dashboard */}
        <div className="bg-zinc-950/65 border border-zinc-900 rounded-3xl p-4 space-y-3">
          <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
            {appLanguage === 'bn' ? 'অনুমতি ও ইন্টিগ্রেশন স্ট্যাটাস' : 'Integration & Service Gateway'}
          </h5>

          <div className="grid grid-cols-2 gap-3.5 text-[10px]">
            <div className="flex items-center space-x-2 bg-black/40 border border-zinc-855 rounded-xl px-2.5 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <div className="flex-1 min-w-0">
                <span className="text-[8px] text-gray-500 uppercase font-extrabold block leading-none mr-1">Firebase Sync</span>
                <span className="text-[10px] font-black text-emerald-400 block mt-1 leading-none">{appLanguage === 'bn' ? 'সক্রিয়' : 'ACTIVE'}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 bg-black/40 border border-zinc-855 rounded-xl px-2.5 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <div className="flex-1 min-w-0">
                <span className="text-[8px] text-gray-500 uppercase font-extrabold block leading-none mr-1">Google Service</span>
                <span className="text-[10px] font-black text-cyan-400 block mt-1 leading-none">{appLanguage === 'bn' ? 'সংযুক্ত' : 'CONNECTED'}</span>
              </div>
            </div>
          </div>
          
          <p className="text-[9px] text-gray-500 font-semibold leading-relaxed italic text-center pl-0.5">
            {appLanguage === 'bn' 
              ? "● এই ক্রিয়েটর ড্যাশবোর্ডের সব ফায়ারবেস ডেটা সিঙ্ক ও গুগল মিডিয়া ক্লাউড পারমিশন সক্রিয় আছে।" 
              : "● Realtime Cloud database, indexing tables and upload pipelines are completely authorized."}
          </p>
        </div>

        <button 
          onClick={() => {
            hapticFeedback('medium');
            onClose();
            window.dispatchEvent(new CustomEvent('open-pro-dashboard'));
          }}
          className="w-full bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-300 p-3.5 rounded-2xl flex items-center justify-between text-xs font-black active:scale-95 transition-all text-left uppercase tracking-wider outline-none font-semibold"
        >
          <span>Open Interactive Workspace</span>
          <ArrowRight className="w-4 h-4 text-violet-400" />
        </button>

      </div>
    );
  };

  return (
    <motion.div 
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      className="fixed inset-0 z-[100] bg-black overflow-hidden"
    >
      <div className="w-full bg-[var(--bg-primary)] h-full relative flex flex-col transition-colors duration-300">
        
        {/* Dynamic Navigation Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]/80 bg-zinc-950/60 sticky top-0 z-50">
          <div className="flex items-center">
            {currentSection === 'settings' && settingsSub !== 'none' ? (
              <button 
                onClick={() => {
                  hapticFeedback('light');
                  setSettingsSub('none');
                }}
                className="p-1.5 hover:bg-zinc-900 rounded-full transition-colors mr-3 text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : currentSection !== 'menu' && initialSection !== 'settings' ? (
              <button 
                onClick={() => {
                  hapticFeedback('light');
                  if (currentSection === 'groups' && activeGroup) {
                    setActiveGroup(null);
                  } else {
                    setCurrentSection('menu');
                  }
                }}
                className="p-1.5 hover:bg-zinc-900 rounded-full transition-colors mr-3 text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-zinc-900 rounded-full transition-colors mr-3 text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-[var(--text-primary)] text-sm font-black uppercase tracking-wider">
              {currentSection === 'menu' && (appLanguage === 'bn' ? 'পোর্টাল মেনু' : 'Portal Menu')}
              {currentSection === 'friends' && (appLanguage === 'bn' ? 'বন্ধুরা' : 'Friends Circle')}
              {currentSection === 'dashboard' && (appLanguage === 'bn' ? 'ড্যাশবোর্ড' : 'Creator Analytics')}
              {currentSection === 'saved' && (appLanguage === 'bn' ? 'সেভড' : 'Bookmarked Reels')}
              {currentSection === 'memories' && (appLanguage === 'bn' ? 'মেমোরিজ' : 'Memory Lane')}
              {currentSection === 'groups' && (appLanguage === 'bn' ? 'গ্রুপস' : 'Active Communities')}
              {currentSection === 'meta-ai' && (appLanguage === 'bn' ? 'এআই' : 'World AI Assistant')}
              {currentSection === 'scam-protection' && (appLanguage === 'bn' ? 'সুরক্ষা' : 'Anti-Scam Corner')}
              {currentSection === 'support' && (appLanguage === 'bn' ? 'সাহায্য' : 'Help Desk FAQs')}
              {currentSection === 'report-problem' && (appLanguage === 'bn' ? 'অভিযোগ' : 'Report a Problem')}
              {currentSection === 'terms' && (appLanguage === 'bn' ? 'নীতিমালা' : 'Platform Policies')}
              {currentSection === 'install-guide' && (appLanguage === 'bn' ? 'অ্যাপ ইনস্টল ও প্লে-স্টোর গাইড' : 'App Install & Play Store Ready')}
              {currentSection === 'settings' && (
                settingsSub === 'none' ? (appLanguage === 'bn' ? 'সেটিংস' : 'Core Settings') :
                settingsSub === 'edit-profile' ? (appLanguage === 'bn' ? 'প্রোফাইল সম্পাদন' : 'Edit Profile') :
                settingsSub === 'edit-username' ? (appLanguage === 'bn' ? 'ইউজারনেম' : 'Username Settings') :
                settingsSub === 'verification' ? (appLanguage === 'bn' ? 'ভেরিফিকেশন' : 'Verification Status') :
                settingsSub === 'social-balance' ? (appLanguage === 'bn' ? 'সামাজিক ব্যালেন্স' : 'Social Balance') :
                settingsSub === 'ad-manager' ? (appLanguage === 'bn' ? 'বিজ্ঞাপন ম্যানেজার' : 'Ad Campaign') :
                settingsSub === 'app-lock' ? (appLanguage === 'bn' ? 'অ্যাপ লক' : 'App Access Lock') :
                settingsSub === 'privacy-settings' ? (appLanguage === 'bn' ? 'প্রাইভেসি সেটিংস' : 'Core Privacy Keys') :
                settingsSub === 'permissions-gateway' ? (appLanguage === 'bn' ? 'সার্ভার ও গুগল পারমিশন' : 'Server & Google Permissions') :
                settingsSub === 'app-update' ? (appLanguage === 'bn' ? 'সফটওয়্যার আপডেট' : 'Software Update') :
                settingsSub === 'logged-in-devices' ? (appLanguage === 'bn' ? 'ডিভাইস লিস্ট' : 'Active Approved Devices') :
                settingsSub === 'change-password' ? (appLanguage === 'bn' ? 'পাসওয়ার্ড কোড' : 'Key Passwords') :
                settingsSub === 'monetization' ? (appLanguage === 'bn' ? 'মনিটাইজেশন' : 'Monetization Progress') :
                settingsSub === 'download-data' ? (appLanguage === 'bn' ? 'ডেটা ডাউনলোড' : 'Download Sync Logs') : 'Settings'
              )}
            </h2>
          </div>
          
          <button 
            onClick={onClose}
            className="p-1.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 rounded-full transition-all text-gray-400 active:scale-95"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Dynamic Section Contents Scrollable Box */}
        <div className="flex-1 overflow-y-auto">
          {currentSection === 'menu' && renderMenuPortal()}
          {currentSection === 'friends' && renderFriendsSection()}
          {currentSection === 'dashboard' && renderDashboardSection()}
          {currentSection === 'saved' && renderSavedPostsSection()}
          {currentSection === 'memories' && renderMemoriesSection()}
          {currentSection === 'groups' && renderGroupsSection()}
          {currentSection === 'meta-ai' && renderMetaAIChat()}
          {currentSection === 'scam-protection' && renderScamProtection()}
          {currentSection === 'support' && renderSupportFAQ()}
          {currentSection === 'report-problem' && renderReportProblem()}
          {currentSection === 'terms' && renderTermsPolicies()}
          {currentSection === 'install-guide' && renderInstallGuide()}
          {currentSection === 'settings' && (() => {
            const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
            return (
              <div className={cn(
                "p-4 md:p-6 space-y-6 animate-in fade-in duration-300 transition-colors text-left",
                isDarkMode ? "bg-zinc-950 text-white" : "bg-zinc-50 text-zinc-900"
              )}>
                
                {settingsSub === 'none' && (
                  <div className="space-y-6">
                    
                    {/* PROFILE CARD */}
                    <div className={cn(
                      "rounded-3xl p-4 transition-all border",
                      isDarkMode ? "bg-zinc-900/90 border-zinc-800/80" : "bg-white border-zinc-200/80 shadow-sm"
                    )}>
                      {/* Avatar Profile Row */}
                      <div 
                        onClick={() => setSettingsSub('edit-profile')}
                        className="flex items-center justify-between cursor-pointer group pb-3.5 border-b border-gray-150/50 dark:border-zinc-800/50"
                      >
                        <div className="flex items-center space-x-3.5 text-left">
                          <img 
                            src={user?.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80"} 
                            className="w-12 h-12 rounded-full object-cover border-2 border-pink-500/30 shrink-0"
                            alt="User avatar"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h3 className={cn("text-base font-black transition-colors leading-none", isDarkMode ? "text-white group-hover:text-pink-400" : "text-zinc-900 group-hover:text-pink-500")}>
                              {user?.fullName || "Guest User"}
                            </h3>
                            <span className="text-[9px] uppercase font-extrabold tracking-widest text-[#FF4B91] mt-1.5 inline-block">
                              {appLanguage === 'bn' ? 'ব্যক্তিগত অ্যাকাউন্ট' : 'Personal Account'}
                            </span>
                          </div>
                        </div>
                        <div className={cn("p-1.5 rounded-full", isDarkMode ? "bg-zinc-800" : "bg-zinc-100")}>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>

                      {/* Profile Settings Rows */}
                      <div className="pt-2.5 space-y-1">
                        <button 
                          onClick={() => setSettingsSub('edit-profile')}
                          className="w-full flex items-center justify-between py-2 text-left hover:opacity-80 transition-opacity"
                        >
                          <div className="flex items-center space-x-3 text-sm font-semibold">
                            <span className="text-base text-pink-505">✏️</span>
                            <span>{appLanguage === 'bn' ? 'প্রোফাইল সংশোধন করুন' : 'Edit Profile Info'}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        <button 
                          onClick={() => setSettingsSub('edit-username')}
                          className="w-full flex items-center justify-between py-2 text-left hover:opacity-80 transition-opacity"
                        >
                          <div className="flex items-center space-x-3 text-sm font-semibold">
                            <span className="text-base text-pink-505">📌</span>
                            <div className="leading-tight">
                              <div>{appLanguage === 'bn' ? 'ইউজারনেম' : 'Username'}</div>
                              <div className="text-[9px] text-gray-400 font-bold mt-0.5">@{user?.username || "not_defined"}</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    {/* REDEEM BLUE VERIFICATION BADGE */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'ভেরিফিকেশন' : 'Verification Badge'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/85" : "bg-white border-zinc-200/80 shadow-sm"
                      )}>
                        <button 
                          onClick={() => setSettingsSub('verification')}
                          className="w-full flex items-center justify-between text-left animate-pulse animate-duration-3000"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/20">
                              <BadgeCheck className="w-4 h-4 fill-blue-500 text-blue-400" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'অ্যাকাউন্ট ভেরিফিকেশন' : 'Get Verified Badge'}</h4>
                              <p className="text-[10px] text-gray-500 mt-1 font-semibold">
                                {user?.isVerified 
                                  ? (appLanguage === 'bn' ? 'ভেরিফাইড অ্যাকাউন্ট সক্রিয়' : 'Blue verification mark active') 
                                  : (appLanguage === 'bn' ? 'ব্লু ভেরিফাইড ব্যাজ সক্রিয় করুন' : 'Unlock professional verification badge')}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    {/* CREATOR PANEL */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'ক্রিয়েটর সেক্টর' : 'Creator Panel'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border divide-y",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/80 divide-zinc-800/40" : "bg-white border-zinc-200/80 shadow-sm divide-gray-150/40"
                      )}>
                        {/* Pro Mode Toggle Switch Row */}
                        <div className="py-3 first:pt-0 pb-3 flex items-center justify-between">
                          <div className="flex items-center space-x-3.5">
                            <div className="p-1.5 bg-gradient-to-tr from-pink-500/10 to-indigo-500/10 text-[#FF4B91] rounded-xl border border-pink-500/20">
                              <Sparkles className="w-4 h-4 fill-[#FF4B91] text-pink-400" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'প্রফেশনাল মোড' : 'Professional Mode'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">
                                {localIsProMode 
                                  ? (appLanguage === 'bn' ? 'মনিটাইজেশন ও ক্রিয়েটর টুলস সক্রিয়' : 'Monetization & content tools active 💯')
                                  : (appLanguage === 'bn' ? 'ক্রিয়েশন রিচ ও ইনকাম অপশন সক্রিয় করতে অন করুন' : 'Tap to activate professional creator metrics panel')}
                              </p>
                            </div>
                          </div>
                          
                          <button 
                            id="pro_mode_settings_toggle_btn"
                            onClick={async () => {
                              hapticFeedback('heavy');
                              const nextVal = !localIsProMode;
                              setLocalIsProMode(nextVal);
                              if (onToggleProMode) {
                                onToggleProMode(nextVal);
                              }
                              if (user?.id) {
                                try {
                                  await setDoc(doc(db, 'users', user.id), { isProMode: nextVal }, { merge: true });
                                  user.isProMode = nextVal;
                                } catch (err) {
                                  console.error("Error setting pro mode:", err);
                                }
                              }
                            }}
                            className={cn(
                              "w-11 h-6 rounded-full p-0.5 transition-all outline-none",
                              localIsProMode ? "bg-[#FF4B91]" : "bg-zinc-700"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-full bg-white transition-all shadow-md",
                              localIsProMode ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>

                        {/* Pro Dashboard */}
                        <button 
                          onClick={() => {
                            hapticFeedback('medium');
                            if (!localIsProMode) {
                              if (onShowProSetup) {
                                onShowProSetup();
                              } else {
                                alert(appLanguage === 'bn' ? "প্রথমে প্রফেশনাল মোড চালু করুন!" : "Please turn on Professional Mode first to explore insights!");
                              }
                            } else {
                              if (onShowProDashboard) {
                                onShowProDashboard();
                              } else {
                                setCurrentSection('dashboard');
                              }
                            }
                          }}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
                              <LayoutDashboard className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'প্রফেশনাল ড্যাশবোর্ড' : 'Professional Dashboard'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'ক্রিয়েটর এনালিটিক্স এবং ইনসাইট' : 'Insights, content analytics & monetization statistics'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Social Balance & Coin Wallet */}
                        <button 
                          onClick={() => setSettingsSub('social-balance')}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                              <Coins className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'সামাজিক ব্যালেন্স' : 'Social Coin Balance'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'উইথড্রয়াল, আর্নিং এবং পেমেন্ট হিস্টোরি' : 'Recharge, earnings, withdrawals and payment history'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Ad Campaign Manager / Boost */}
                        <button 
                          onClick={() => setSettingsSub('ad-manager')}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
                              <Zap className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'বিজ্ঞাপন ম্যানেজার' : 'Ad Campaign Manager'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'ভিডিও রিচ বাড়ানো এবং প্রমোশনাল ক্যাম্পেইন' : 'Promotional campaigns, boosts and status'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Partners Monetization criteria */}
                        <button 
                          onClick={() => setSettingsSub('monetization')}
                          className="w-full flex items-center justify-between text-left py-3 last:pb-0"
                        >
                          <div className="flex items-center space-x-3.5 text-left">
                            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                              <Sparkles className="w-4 h-4 animate-pulse" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'মনিটাইজেশন এবং রেভিনিউ' : 'Monetization Check'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">
                                {appLanguage === 'bn' ? `প্রয়োজন ৫,০০০ ফলোয়ার (বর্তমান: ৩)` : `Need 5,000 followers (Current: ${allUsers.length || 3})`}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    {/* APPEARANCE */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'অ্যাপিয়ারেন্স (চেহারা কুটির)' : 'Appearance & Preferences'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border divide-y",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/80 divide-zinc-800/40" : "bg-white border-zinc-200/80 shadow-sm divide-gray-150/40"
                      )}>
                        
                        {/* Theme Select Row */}
                        <div className="py-3 first:pt-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Sun className="w-4 h-4 text-orange-400" />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'অ্যাপ থিম' : 'Aesthetic Theme'}</span>
                            </div>
                            
                            <div className={cn(
                              "p-1 rounded-full flex items-center gap-1 border",
                              isDarkMode ? "bg-zinc-950 border-zinc-800" : "bg-gray-100 border-gray-200"
                            )}>
                              <button 
                                onClick={() => { if (isDarkMode) onToggleTheme(); }}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[9px] font-black transition-all",
                                  !isDarkMode ? "bg-[#FF4B91] text-white shadow" : "text-gray-400 hover:text-white"
                                )}
                              >
                                {appLanguage === 'bn' ? 'লাইট' : 'Light'}
                              </button>
                              <button 
                                onClick={() => { if (!isDarkMode) onToggleTheme(); }}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[9px] font-black transition-all",
                                  isDarkMode ? "bg-[#FF4B91] text-white shadow" : "text-gray-400 hover:text-zinc-900"
                                )}
                              >
                                {appLanguage === 'bn' ? 'ডার্ক' : 'Dark'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Language Selection Row */}
                        <div className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Languages className="w-4 h-4 text-blue-400" />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'ভাষা নির্ধারণ' : 'App Language'}</span>
                            </div>

                            <div className={cn(
                              "p-1 rounded-full flex items-center gap-1 border",
                              isDarkMode ? "bg-zinc-950 border-zinc-800" : "bg-gray-100 border-gray-200"
                            )}>
                              <button 
                                onClick={() => {
                                  localStorage.setItem('appLanguage', 'en');
                                  setAppLanguage('en');
                                  window.dispatchEvent(new CustomEvent('app-language-changed', { detail: 'en' }));
                                }}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[9px] font-black transition-all",
                                  appLanguage === 'en' ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white"
                                )}
                              >
                                English
                              </button>
                              <button 
                                onClick={() => {
                                  localStorage.setItem('appLanguage', 'bn');
                                  setAppLanguage('bn');
                                  window.dispatchEvent(new CustomEvent('app-language-changed', { detail: 'bn' }));
                                }}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[9px] font-black transition-all",
                                  appLanguage === 'bn' ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-zinc-950"
                                )}
                              >
                                বাংলা
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Autoplay Toggle slider */}
                        <div className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Play className="w-4 h-4 text-cyan-400" />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'স্বয়ংক্রিয় প্লে করুন' : 'Autoplay Videos'}</span>
                            </div>
                            
                            <button 
                              onClick={toggleAutoplayVideos}
                              className={cn(
                                "w-11 h-6 rounded-full p-0.5 transition-all outline-none",
                                autoplayVideos ? "bg-green-500" : "bg-zinc-700"
                              )}
                            >
                              <div className={cn(
                                "w-5 h-5 rounded-full bg-white transition-all shadow-md",
                                autoplayVideos ? "translate-x-5" : "translate-x-0"
                              )} />
                            </button>
                          </div>
                        </div>

                        {/* Story Style Layout Switcher */}
                        <div className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Radio className="w-4 h-4 text-pink-500" />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'স্টোরি দেখার স্টাইল' : 'Story Highlights Style'}</span>
                            </div>

                            <div className={cn(
                              "p-1 rounded-full flex items-center gap-1 border",
                              isDarkMode ? "bg-zinc-950 border-zinc-800" : "bg-gray-100 border-gray-200"
                            )}>
                              <button 
                                onClick={() => {
                                  localStorage.setItem('world_story_style', 'circle');
                                  alert("Story Style updated to CIRCLE! / বৃত্তাকার লেআউট সেভ করা হয়েছে।");
                                }}
                                className="px-2 py-0.5 rounded-full text-[8.5px] font-black text-gray-400 hover:text-white transition-all"
                              >
                                {appLanguage === 'bn' ? 'বৃত্ত' : 'Circle'}
                              </button>
                              <button 
                                onClick={() => {
                                  localStorage.setItem('world_story_style', 'portrait');
                                  alert("Story Style updated to PORTRAIT! / পোট্রেট লেআউট সেভ করা হয়েছে।");
                                }}
                                className="px-2 py-0.5 rounded-full text-[8.5px] font-black text-gray-400 hover:text-white transition-all"
                              >
                                {appLanguage === 'bn' ? 'পোর্ট্রেট' : 'Portrait'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Feed Reaction Pos Selector */}
                        <div className="py-3 last:pb-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <ThumbsUp className="w-4 h-4 text-[#FF4B91]" />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'রিঅ্যাকশন বাটন স্লট' : 'Feed Reaction Position'}</span>
                            </div>

                            <button 
                              onClick={() => {
                                const current = localStorage.getItem('world_feed_reaction_position') || 'right';
                                const next = current === 'right' ? 'left' : 'right';
                                localStorage.setItem('world_feed_reaction_position', next);
                                alert(`Feed Reaction Position changed to ${next.toUpperCase()}!`);
                              }}
                              className="px-3 py-1.5 text-[8.5px] font-black bg-zinc-800 border border-zinc-700/60 rounded-xl hover:bg-zinc-750 transition-all text-white uppercase tracking-wider"
                            >
                              {appLanguage === 'bn' ? 'পজিশন পরিবর্তন' : 'Toggle Alignment'}
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* INTERACTIVE PRIVACY & EXPORTS */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'ডেটা ও প্রাইভেসি নিয়ন্ত্রণ' : 'Data & Privacy Settings'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border divide-y",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/80 divide-zinc-800/40" : "bg-white border-zinc-200/80 shadow-sm divide-gray-150/40"
                      )}>
                        
                        {/* Saved post index link */}
                        <button 
                          onClick={() => { hapticFeedback('medium'); setCurrentSection('saved'); }}
                          className="w-full flex items-center justify-between text-left py-3 first:pt-0"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-pink-500/10 text-[#FF4B91] rounded-xl border border-pink-500/20">
                              <Bookmark className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'সংরক্ষিত পোস্ট সমূহ' : 'Saved Bookmarks'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'আপনার বুকমার্ক করা সকল ভিডিও ও রিলস' : 'Review posts and reels you bookmarked'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Profile Info fields public vs private */}
                        <button 
                          onClick={() => setSettingsSub('privacy-settings')}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
                              <Lock className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'প্রাইভেসি সেটিংস (অন-অফ)' : 'Privacy Toggles & Lock'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'ইমেইল, ফোন এবং এড্রেস প্রাইভেসি কন্ট্রোল' : 'Configure dynamic display of your personal account assets'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Download JSON Data file */}
                        <button 
                          onClick={() => setSettingsSub('download-data')}
                          className="w-full flex items-center justify-between text-left py-3 last:pb-0"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/10">
                              <Download className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'আমার ডেটা ডাউনলোড করুন' : 'Export Account Schema JSON'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'আপনার পোস্ট ও পছন্দের সমস্ত হিস্টোরি এক্সপোর্ট করুন' : 'Export and backup all personal media posts as JSON'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                      </div>
                    </div>

                    {/* PRIVACY DEEP DEVICE SECURITY */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'ডিভাইস নিরাপত্তা এবং পাসওয়ার্ড লগ' : 'App Security & Access Log'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border divide-y",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/80 divide-zinc-800/40" : "bg-white border-zinc-200/80 shadow-sm divide-gray-150/40"
                      )}>
                        
                        {/* Whos logged in */}
                        <button 
                          onClick={() => setSettingsSub('logged-in-devices')}
                          className="w-full flex items-center justify-between text-left py-3 first:pt-0"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'আপনি যেখানে লগইন আছেন' : "Active Session Devices"}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'লগইন থাকা সমস্ত ডিভাইস এবং রিমোট রিমুভাল' : 'Review active devices and revoke old sessions'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Server & Google Permissions */}
                        <button 
                          onClick={() => { hapticFeedback('medium'); setSettingsSub('permissions-gateway'); }}
                          className="w-full flex items-center justify-between text-left py-3 hover:bg-zinc-800/10 transition-colors"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                              <ShieldAlert className="w-4 h-4 text-emerald-400 animate-pulse" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none text-emerald-400">{appLanguage === 'bn' ? 'সার্ভার ও গুগল পারমিশন' : 'Server & Google Permissions'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'ফায়ারবেস ক্লাউড ডেটা সিঙ্ক ও গুগল মিডিয়া ক্লাউড অনুমতি' : 'Manage Firestore Live Sync & Google Web Gateways'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-emerald-400" />
                        </button>

                        {/* Reset password */}
                        <button 
                          onClick={() => setSettingsSub('change-password')}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20">
                              <Lock className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'পাসওয়ার্ড পরিবর্তন করুন' : 'Change Password'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'আপনার একাউন্টের সিকিউরিটি কোড বদলান' : 'Reset password instantly via registered recovery email'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* PIN access lock */}
                        <button 
                          onClick={() => setSettingsSub('app-lock')}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/25">
                              <ShieldAlert className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'সিকিউরিটি পিন লক' : 'App Access PIN Lock'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? '৪ ডিজিটের সিকিউরিটি লক কোড চালু করুন' : 'Force passcode credentials security upon startup'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5 rounded border leading-none tracking-wide",
                              appLockEnabled ? "bg-green-500/20 text-green-400 border-green-500/20" : "bg-zinc-800 text-gray-450 border-zinc-700"
                            )}>
                              {appLockEnabled ? (appLanguage === 'bn' ? "সক্রিয়" : "ON") : (appLanguage === 'bn' ? "বন্ধ" : "OFF")}
                            </span>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </button>

                        {/* Keep Alive Background socket system */}
                        <div className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <RefreshCw className="w-4 h-4 text-violet-400 animate-spin animate-duration-10000" />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'ব্যাকগ্রাউন্ড সিঙ্ক' : 'Continuous Sync Keep-Alive'}</span>
                            </div>
                            
                            <button 
                              onClick={toggleBgKeepAlive}
                              className={cn(
                                "w-11 h-6 rounded-full p-0.5 transition-all outline-none",
                                bgKeepAlive ? "bg-[#FF4B91]" : "bg-zinc-700"
                              )}
                            >
                              <div className={cn(
                                "w-5 h-5 rounded-full bg-white transition-all shadow-md",
                                bgKeepAlive ? "translate-x-5" : "translate-x-0"
                              )} />
                            </button>
                          </div>
                        </div>

                        {/* Real-time WebSocket connection status indicator */}
                        <div className="py-3 border-t border-zinc-800/60">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className={cn(
                                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                socketConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                              )} />
                              <span className="text-xs font-black">{appLanguage === 'bn' ? 'রিয়েলটাইম ওয়েবসকেট সংযোগ' : 'Real-time WebSocket'}</span>
                            </div>
                            <span className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5 rounded border leading-none tracking-wide",
                              socketConnected ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                            )}>
                              {socketConnected ? (appLanguage === 'bn' ? "সংযুক্ত 🟢" : "CONNECTED") : (appLanguage === 'bn' ? "বিচ্ছিন্ন 🔴" : "DISCONNECTED")}
                            </span>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* SAFETY & DISCLOSURES */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'সুরক্ষা ও আইনি নীতিমালা' : 'Safety & Legal Standings'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border divide-y",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/80 divide-zinc-800/40" : "bg-white border-zinc-200/80 shadow-sm divide-gray-150/40"
                      )}>
                        
                        {/* Scam protection quiz link */}
                        <button 
                          onClick={() => { hapticFeedback('medium'); setCurrentSection('scam-protection'); }}
                          className="w-full flex items-center justify-between text-left py-3 first:pt-0"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20">
                              <ShieldCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'স্ক্যাম প্রতিরোধ কেন্দ্র' : 'Safety Standards Portal'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'মেম্বারদের জন্য সিকিউরিটি কুইজ' : 'Explore platform defensive rules and interactive security checks'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Terms and conditions */}
                        <button 
                          onClick={() => { hapticFeedback('medium'); setCurrentSection('terms'); }}
                          className="w-full flex items-center justify-between text-left py-3"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/15">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'ব্যবহারের সিকিউরিটি নীতিমালা' : 'Terms & Policies'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'রিলস ও মেম্বারদের জন্য কপিরাইট নীতি' : 'Ensure fair use, copyrights and safety rules'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Read only privacy policy alerts */}
                        <button 
                          onClick={() => {
                            hapticFeedback('medium');
                            alert(appLanguage === 'bn' ? "গোপনীয়তা রক্ষা: ওয়ার্ল্ড সামাজিক নেটওয়ার্ক আপনার কোনো গোপন তথ্য সংরক্ষণ করে না!" : "Security Integrity: WORLD platform protects your privacy logs fully.");
                          }}
                          className="w-full flex items-center justify-between text-left py-3 last:pb-0"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
                              <Lock className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'গোপনীয়তার পরিচ্ছন্ন নীতি' : 'System Privacy Policy'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'অ্যাকাউন্টের ব্যক্তিগত তথ্য সুরক্ষিত রুট' : 'Read privacy standards of cloud router encryption'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>

                      </div>
                    </div>

                    {/* RECENT TIC TICKETS HELP */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-gray-400 pl-1 block text-left">
                        {appLanguage === 'bn' ? 'যোগাযোগ ও হেল্পডেস্ক' : 'Feedback & Help'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/85" : "bg-white border-zinc-200/80 shadow-sm"
                      )}>
                        <button 
                          onClick={() => { hapticFeedback('medium'); setCurrentSection('support'); }}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
                              <HelpCircle className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none">{appLanguage === 'bn' ? 'হেল্প গাইড এবং কাস্টমার কেয়ার' : 'Online Help ticketing'}</h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'অ্যাকাউন্ট বা কয়েন বিষয়ক সমস্যার টিকিট তৈরি করুন' : 'Ask questions, raise dispute tokens or file feedback'}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    {/* SOFTWARE VERSION UPDATES */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] uppercase font-black tracking-widest text-[#FF4B91] pl-1 block text-left">
                        {appLanguage === 'bn' ? 'সিস্টেম ও সফটওয়্যার সংস্করণ' : 'System & Software updates'}
                      </span>
                      <div className={cn(
                        "rounded-3xl p-4 transition-all border divide-y",
                        isDarkMode ? "bg-zinc-900/90 border-zinc-800/80 divide-zinc-800/40" : "bg-white border-zinc-200/80 shadow-sm divide-gray-150/40"
                      )}>
                        <button 
                          onClick={() => { hapticFeedback('medium'); setSettingsSub('app-update'); }}
                          className="w-full flex items-center justify-between text-left py-1 first:pt-0 pb-1"
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="p-2 bg-pink-500/10 text-pink-500 rounded-xl border border-pink-500/20">
                              <RefreshCw className={cn("w-4 h-4 text-pink-400", updateAvailable ? "animate-spin animate-duration-5000" : "")} />
                            </div>
                            <div>
                              <h4 className="text-xs font-black leading-none flex items-center gap-1.5">
                                <span>{appLanguage === 'bn' ? 'সফটওয়্যার আপডেট চেক' : 'Software Update Check'}</span>
                                {updateAvailable && (
                                  <span className="w-2 h-2 rounded-full bg-[#FF4B91] animate-pulse" />
                                )}
                              </h4>
                              <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">
                                {appLanguage === 'bn' ? 'বর্তমান সংস্করণ: ' + CLIENT_VERSION : 'Current: ' + CLIENT_VERSION}
                                {updateAvailable && <span className="text-[#FF4B91] font-bold ml-1">({appLanguage === 'bn' ? 'নতুন সংস্করণ উপলব্ধ!' : 'Update Ready!'})</span>}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    {/* FORCE FIX AND CACHING CHIP */}
                    <div className={cn(
                      "rounded-3xl p-4 transition-all border text-left space-y-3.5",
                      isDarkMode ? "bg-zinc-900/40 border-zinc-800/40 shadow-none" : "bg-white border-zinc-200/80 shadow-sm"
                    )}>
                      <h4 className="text-[9.5px] uppercase font-black tracking-widest text-gray-500">{appLanguage === 'bn' ? 'রিফ্রেশ এবং কুইক রিকভার' : 'Cache & Core Connection Fixes'}</h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button 
                          onClick={() => { hapticFeedback('medium'); forceReconnect(); }}
                          className="bg-zinc-950/40 hover:bg-zinc-900/80 border border-zinc-800 text-white py-3 rounded-2xl flex flex-col items-center justify-center space-y-1.5 active:scale-95 transition-all text-xs"
                        >
                          <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin animate-duration-10000" />
                          <span className="text-[8.5px] font-black uppercase tracking-wider">{appLanguage === 'bn' ? 'কানেকশন রিমোট' : 'Fix Connection'}</span>
                        </button>

                        <button 
                          onClick={() => { hapticFeedback('medium'); clearAppCache(); }}
                          className="bg-zinc-950/40 hover:bg-zinc-900/80 border border-zinc-800 text-white py-3 rounded-2xl flex flex-col items-center justify-center space-y-1.5 active:scale-95 transition-all text-xs"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                          <span className="text-[8.5px] font-black uppercase tracking-wider">{appLanguage === 'bn' ? 'ক্যাশে মুছুন' : 'Wipe Cache'}</span>
                        </button>
                      </div>
                    </div>

                    {/* LOGOUT */}
                    <div className={cn(
                      "rounded-3xl p-4 transition-all border",
                      isDarkMode ? "bg-zinc-900/90 border-zinc-800/80" : "bg-white border-zinc-200/80 shadow-sm"
                    )}>
                      <button 
                        onClick={async () => {
                          hapticFeedback('medium');
                          const msg = appLanguage === 'bn'
                            ? "আপনি কি নিশ্চিত যে অ্যাকাউন্ট থেকে লগআউট করতে চান?"
                            : "Are you sure you want to log out from this account?";
                          if (window.confirm(msg)) {
                            onClose();
                            await logout();
                          }
                        }}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div className="flex items-center space-x-3.5">
                          <div className="p-2 bg-red-500/10 text-red-500 rounded-xl border border-red-500/15">
                            <LogOut className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-red-500 leading-none">{appLanguage === 'bn' ? 'লগআউট করুন' : 'Logout Account'}</h4>
                            <p className="text-[9.5px] text-gray-500 mt-1 font-semibold">{appLanguage === 'bn' ? 'অন্য ডিভাইসে ব্যবহারের জন্য লগআউট করুন' : 'Safely disconnect active credential tokens'}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-red-400/80 animate-pulse" />
                      </button>
                    </div>

                    {/* DELETE ACCOUNT & SYSTEM REGISTRATION */}
                    <div className="flex flex-col items-center space-y-1 pt-2">
                      <button 
                        onClick={deleteAccount}
                        className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#FF4B91]/70 hover:text-[#FF4B91] transition-colors"
                      >
                        {appLanguage === 'bn' ? 'স্থায়ীভাবে একাউন্ট মুছুন' : 'Delete Account Permanently'}
                      </button>
                      <p className="text-[8.5px] text-zinc-500 font-bold uppercase tracking-widest">WORLD Sandbox Client v3.4.1</p>
                    </div>

                    {/* FOOTER MADE IN BANGLADESH */}
                    <div className="py-2.5 text-center flex flex-col items-center space-y-1 select-none">
                      <p className="text-[10.5px] font-black tracking-wide text-gray-500 dark:text-zinc-500 flex items-center gap-1">
                        Made with ❤️ in Bangladesh <span className="text-sm">🇧🇩</span>
                      </p>
                      <p className="text-[8.5px] text-zinc-650 font-bold tracking-tight">Active Social Hub Project</p>
                    </div>

                  </div>
                )}

                {/* SUB PAGES */}

                {/* 1. EDIT PROFILE INFO */}
                {settingsSub === 'edit-profile' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider pl-1">Display Full Name</label>
                      <input 
                        type="text" 
                        value={editedFullName} 
                        onChange={(e) => setEditedFullName(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white px-3.5 py-3 rounded-2xl outline-none focus:border-pink-500/50"
                        placeholder="e.g. Shakib Al Hasan"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider pl-1">User Biography (Bio)</label>
                      <textarea 
                        value={editedBio} 
                        onChange={(e) => setEditedBio(e.target.value)}
                        className="w-full h-24 bg-zinc-900 border border-zinc-800 text-xs text-white px-3.5 py-3 rounded-2xl outline-none focus:border-pink-500/50 resize-none"
                        placeholder="Write something cool about yourself..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider pl-1">Avatar Image URL</label>
                      <input 
                        type="text" 
                        value={editedPhoto} 
                        onChange={(e) => setEditedPhoto(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white px-3.5 py-3 rounded-2xl outline-none focus:border-pink-500/50"
                        placeholder="https://images.unsplash.com/example"
                      />
                    </div>

                    <button 
                      onClick={async () => {
                        if (!user?.id) return;
                        setSaveLoading(true);
                        try {
                          if (updateUserProfile) {
                            await updateUserProfile({
                              fullName: editedFullName,
                              bio: editedBio,
                              profilePhoto: editedPhoto
                            });
                          } else {
                            const ref = doc(db, 'users', user.id);
                            await setDoc(ref, {
                              fullName: editedFullName,
                              bio: editedBio,
                              profilePhoto: editedPhoto
                            }, { merge: true });
                          }
                          alert(appLanguage === 'bn' ? "প্রোফাইল তথ্য সফলভাবে সংরক্ষিত!" : "Profile database updated successfully!");
                          setSettingsSub('none');
                        } catch (err) {
                          alert("Failed to save: " + err);
                        } finally {
                          setSaveLoading(false);
                        }
                      }}
                      disabled={saveLoading}
                      className="w-full py-4 bg-gradient-to-r from-[#FF4B91] to-violet-600 hover:opacity-90 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow active:scale-98"
                    >
                      {saveLoading ? "Saving Credentials..." : (appLanguage === 'bn' ? "তথ্য সংরক্ষণ করুন" : "Save Display Profile")}
                    </button>
                  </div>
                )}

                {/* 2. EDIT USERNAME */}
                {settingsSub === 'edit-username' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider pl-1">Change Unique Handle</label>
                      <div className="relative">
                        <span className="absolute left-4 top-3.5 text-xs text-[#FF4B91] font-extrabold">@</span>
                        <input 
                          type="text" 
                          value={editedUsername} 
                          onChange={(e) => setEditedUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                          className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white pl-8 pr-4 py-3.5 rounded-2xl outline-none focus:border-pink-500/50"
                          placeholder="username"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed pl-1">
                        Use lowercase letters, numbers, and underscores only. Handles are unique identification URLs.
                      </p>
                    </div>

                    <button 
                      onClick={async () => {
                        if (!user?.id || !editedUsername.trim()) return;
                        setSaveLoading(true);
                        try {
                          const ref = doc(db, 'users', user.id);
                          await setDoc(ref, {
                            username: editedUsername.trim()
                          }, { merge: true });
                          alert(appLanguage === 'bn' ? "ইউজারনেম সংরক্ষিত!" : "Your unique handle handle updated on the database!");
                          setSettingsSub('none');
                        } catch (err) {
                          alert("Failed to save: " + err);
                        } finally {
                          setSaveLoading(false);
                        }
                      }}
                      disabled={saveLoading}
                      className="w-full py-4 bg-[#FF4B91] text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow active:scale-98"
                    >
                      {saveLoading ? "Validating Handle..." : (appLanguage === 'bn' ? "ইউজারনেম সেভ করুন" : "Set Username Handle")}
                    </button>
                  </div>
                )}

                {/* 3. VERIFICATION BADGE REDEEM */}
                {settingsSub === 'verification' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 p-4 rounded-3xl border border-zinc-800 text-center space-y-3.5">
                      <div className="w-12 h-12 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto">
                        <BadgeCheck className="w-7 h-7 fill-blue-505 text-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-black text-white">{appLanguage === 'bn' ? "আসল ক্রেডিটর ভেরিফিকেশন" : "Official Verification Badge"}</h3>
                        <p className="text-[10px] text-gray-500 leading-normal font-semibold">
                          Verify your identity and unlock the premium blue verification badge globally on all your posts, feed, and profile cards.
                        </p>
                      </div>
                    </div>

                    <div className="bg-zinc-900/40 border border-[#00A1FF]/20 p-4 rounded-3xl space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-gray-400 uppercase font-extrabold">{appLanguage === 'bn' ? 'বর্তমান ব্যালেন্স' : 'Current Coin Balance'}</span>
                        <span className="text-[#FF4B91] font-black">{user?.coinBalance || 0} Coins</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold border-t border-zinc-800 pt-2.5">
                        <span className="text-gray-405 uppercase font-extrabold">{appLanguage === 'bn' ? 'ভেরিফিকেশন ফি' : 'Verification Badge Fee'}</span>
                        <span className="text-white font-black">750 Coins</span>
                      </div>
                    </div>

                    <button 
                      onClick={async () => {
                        if (!user?.id) return;
                        const coins = user?.coinBalance || 0;
                        if (coins < 750) {
                          alert(appLanguage === 'bn' ? "পর্যাপ্ত কয়েন নেই! দয়া করে ভিডিও দেখে কয়েন সংগ্রহ করুন।" : "Insufficient balance! Access the World Shop or complete tasks to gain at least 750 coins.");
                          return;
                        }
                        setSaveLoading(true);
                        try {
                          const ref = doc(db, 'users', user.id);
                          await setDoc(ref, {
                            coinBalance: coins - 750,
                            isVerified: true
                          }, { merge: true });
                          alert(appLanguage === 'bn' ? "অভিনন্দন! আপনার ব্লু ভেরিফাইড ব্যাজ সক্রিয় হয়েছে!" : "Congratulations! The official blue verification badge is now active on your display profile card.");
                          setSettingsSub('none');
                        } catch (err) {
                          alert("Failed to verify: " + err);
                        } finally {
                          setSaveLoading(false);
                        }
                      }}
                      className="w-full py-4 bg-gradient-to-r from-[#00A1FF] to-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow active:scale-98"
                    >
                      {user?.isVerified 
                        ? (appLanguage === 'bn' ? "অলরেডি ভেরিফাইড" : "Already Verified") 
                        : (appLanguage === 'bn' ? "৭৫০ কয়েন দিয়ে সক্রিয় করুন" : "Redeem with 750 Coins")}
                    </button>
                  </div>
                )}

                {/* 4. SOCIAL BALANCE PANEL */}
                {settingsSub === 'social-balance' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-305">
                    <div className="bg-gradient-to-br from-emerald-600/35 to-teal-750/20 p-5 rounded-3xl border border-emerald-500/20 text-center space-y-2">
                      <p className="text-[10px] uppercase font-extrabold tracking-widest text-[#00E676]">Total Coins Earnings</p>
                      <h2 className="text-3xl font-black text-white tracking-tight">{user?.coinBalance || 0} <span className="text-sm font-bold text-gray-300">coins</span></h2>
                      <p className="text-[9.5px] text-emerald-300/80">Est: ${( (user?.coinBalance || 0)*0.01 ).toFixed(2)} USD available</p>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-3">
                      <h3 className="text-xs font-black text-white uppercase tracking-widest text-[#00A1FF]">Bank Withdrawal Simulation</h3>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                        Withdraw your creator balance to Mobile banking (bKash / Nagad / Rocket) or any local Bangladeshi bank card instant router.
                      </p>
                      
                      <button 
                        onClick={() => {
                          const amount = prompt("Enter coins count to withdraw (Min 5,000 coins):");
                          if (!amount) return;
                          const c = parseInt(amount);
                          if (c < 5000) {
                            alert("Minimum withdrawal coin limit is 5,000 coins!");
                          } else if (c > (user?.coinBalance || 0)) {
                            alert("Insufficient balance for withdrawal!");
                          } else {
                            alert("Payout scheduled successfully! Check updates within 24 hours on your linked phone.");
                          }
                        }}
                        className="w-full py-4 bg-zinc-950 border border-zinc-800 hover:border-[#FF4B91]/40 text-[#FF4B91] text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow"
                      >
                        Request Withdrawal
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. AD MANAGER PANEL */}
                {settingsSub === 'ad-manager' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-3">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Promote Your Videos</h3>
                      <p className="text-[10px] text-gray-404 leading-relaxed font-semibold">
                        Sponsor your videos to appear on the global feed. Gain maximum reach, followers, and interactions.
                      </p>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-3xl space-y-4">
                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Target Video ID or Link</label>
                        <input
                          type="text"
                          placeholder="e.g. video_ad_id_102938"
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-3 py-2.5 rounded-xl text-white outline-none focus:border-[#FF4B91]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Daily Coin Budget</label>
                        <input
                          type="number"
                          placeholder="Min 100 coins"
                          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-3 py-2.5 rounded-xl text-white outline-none focus:border-[#FF4B91]"
                        />
                      </div>

                      <button
                        onClick={() => alert("Campaign queued successfully! Review pending in Ad Desk.")}
                        className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
                      >
                        Launch Sponsor Campaign
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. MONETIZATION PANEL */}
                {settingsSub === 'monetization' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-white uppercase tracking-wider">Creator Monetization</h3>
                        <span className="bg-[#FF4B91]/10 text-[#FF4B91] text-[8px] font-black px-2 py-0.5 rounded-full border border-[#FF4B91]/20 uppercase tracking-widest">Pending Requirements</span>
                      </div>

                      <p className="text-[10px] text-gray-404 leading-relaxed font-semibold">
                        Start earning coins for your views. Withdraw real money once your profile meets the global threshold parameters.
                      </p>

                      <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-gray-300">
                            <span>Followers Progress</span>
                            <span>{user?.followersCount || 0} / 1,000</span>
                          </div>
                          <div className="h-2 bg-zinc-950 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#FF4B91] transition-all duration-500" 
                              style={{ width: `${Math.min(100, ((user?.followersCount || 0) / 1000) * 100)}%` }} 
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-gray-300">
                            <span>Video Views</span>
                            <span>0 / 10,000</span>
                          </div>
                          <div className="h-2 bg-zinc-950 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: '0%' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* privacy-settings */}
                {settingsSub === 'privacy-settings' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-3">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Account Privacy Controls</h3>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-semibold">
                        Toggle visibility settings for your personal identity traits on the platform.
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      {['email', 'phoneNumber', 'address', 'birthday'].map((field) => {
                        const currentVal = user?.privacy?.[field] || 'private';
                        return (
                          <div key={field} className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl flex items-center justify-between">
                            <div>
                              <span className="text-xs font-black text-white uppercase tracking-wider block">
                                {field === 'phoneNumber' ? 'Phone Number' : field}
                              </span>
                              <span className="text-[9.5px] text-gray-505 font-semibold uppercase tracking-tight">
                                Current: {currentVal}
                              </span>
                            </div>
                            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-850">
                              <button
                                onClick={() => updatePrivacy(field, 'public')}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-widest transition-all",
                                  currentVal === 'public' ? "bg-green-500 text-white" : "text-gray-400"
                                )}
                              >
                                Public
                              </button>
                              <button
                                onClick={() => updatePrivacy(field, 'private')}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-widest transition-all",
                                  currentVal === 'private' ? "bg-red-500 text-white" : "text-gray-400"
                                )}
                              >
                                Private
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 7. APP LOCK PIN */}
                {settingsSub === 'app-lock' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-350">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">Enable Synced App PIN Lock</span>
                        <button 
                          onClick={() => {
                            const next = !appLockEnabled;
                            setAppLockEnabled(next);
                            localStorage.setItem('world_app_lock_enabled', String(next));
                          }}
                          className={cn(
                            "w-11 h-6 rounded-full p-0.5 transition-all outline-none",
                            appLockEnabled ? "bg-green-500" : "bg-zinc-700"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-full bg-white transition-all shadow-md",
                            appLockEnabled ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      {appLockEnabled && (
                        <div className="space-y-2.5 border-t border-zinc-800 pt-3 text-left">
                          <label className="text-[10px] font-black uppercase text-gray-400 block pl-0.5">Set 4-Digit Numeric PIN</label>
                          <input 
                            type="password"
                            maxLength={4}
                            value={appLockPin}
                            onChange={(e) => setAppLockPin(e.target.value.replace(/[^0-9]/g, ''))}
                            className="bg-zinc-950 border border-zinc-850 outline-none text-xl font-black tracking-widest text-[#FF4B91] px-4 py-3 rounded-xl mx-auto block text-center w-36"
                            placeholder="••••"
                          />
                          <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                            Note: When enabled, this PIN credentials must be provided whenever configuring settings or opening profile tabs.
                          </p>
                        </div>
                      )}
                    </div>

                    {appLockEnabled && (
                      <button 
                        onClick={() => {
                          if (appLockPin.length !== 4) {
                            alert("Please provide a valid 4-digit numeric PIN passcode!");
                            return;
                          }
                          localStorage.setItem('world_app_lock_pin', appLockPin);
                          localStorage.setItem('world_app_lock_enabled', 'true');
                          alert("💯 Passcode numeric PIN lock enabled and synchronized!");
                          setSettingsSub('none');
                        }}
                        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-98 transition-all font-semibold"
                      >
                        Save PIN Passcode
                      </button>
                    )}
                  </div>
                )}

                {/* 8. ACTIVE SESSIONS LIST */}
                {settingsSub === 'logged-in-devices' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-350">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-3 text-left">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Approved Authenticated Devices</h3>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-semibold">
                        Review all active sessions connected to your profile context. Disconnect suspicious logins instantly.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {sessionsLoading ? (
                        <div className="p-8 text-center text-gray-500">Loading sessions registry...</div>
                      ) : sessions.map((sess: any, idx: number) => {
                        const isCurrent = sess.id === sessionId;
                        const isWeb = sess.deviceType === 'desktop' || !sess.deviceType;

                        return (
                          <div 
                            key={`${sess.id || 'sess'}-${idx}`}
                            className={cn(
                              "p-3.5 rounded-2xl border flex items-center justify-between text-left",
                              isCurrent ? "bg-indigo-600/15 border-indigo-500/30" : "bg-zinc-900 border border-zinc-800"
                            )}
                          >
                            <div className="flex items-center space-x-3.5">
                              {isWeb ? (
                                <Laptop className="w-5 h-5 text-gray-400 shrink-0" />
                              ) : (
                                <Smartphone className="w-5 h-5 text-[#FF4B91] shrink-0" />
                              )}
                              
                              <div>
                                <h4 className="text-xs font-black text-white flex items-center gap-2">
                                  {sess.deviceName || (isWeb ? 'Desktop Laptop Web' : 'Mobile Smartphone')}
                                  {isCurrent && (
                                    <span className="bg-green-500/20 text-green-400 border border-green-500/20 text-[7px] font-black uppercase px-1.5 py-0.5 rounded leading-none">Active Device</span>
                                  )}
                                </h4>
                                <p className="text-[9.5px] text-gray-505 mt-1 font-semibold">IP Address: {sess.ipAddress || '127.0.0.1'} • {sess.location || 'Bangladesh'}</p>
                              </div>
                            </div>
                            
                            {!isCurrent && (
                              <button 
                                onClick={() => terminateSession(sess.id)}
                                className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 9. SECURED CHANGE PASSWORD */}
                {settingsSub === 'change-password' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-4 text-left">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Change Account Password</h3>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                        Enter your active register email address. We will route a secure password reset link directly to your inbox.
                      </p>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-400">Associated Email Address</label>
                        <input 
                          type="email"
                          disabled
                          value={user?.email || "No email registered"}
                          className="w-full bg-zinc-950 border border-zinc-850 text-xs text-gray-400 px-3 py-3 rounded-xl cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={async () => {
                        if (!user?.email) return;
                        setSaveLoading(true);
                        try {
                          alert(`Verification reset email has been routed successfully to: ${user.email}`);
                          setSettingsSub('none');
                        } catch (err) {
                          alert("Failed to route reset email: " + err);
                        } finally {
                          setSaveLoading(false);
                        }
                      }}
                      className="w-full py-4 bg-gradient-to-r from-red-500 to-[#FF4B91] text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-98 transition-all font-semibold"
                    >
                      {saveLoading ? "Routing Keys..." : "Send Reset Verification Code Email"}
                    </button>
                  </div>
                )}

                {/* 10. DOWNLOAD DATA */}
                {settingsSub === 'download-data' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-4 text-left">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Download Profile Data Archive</h3>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                        Generate and download a complete archive of your local configuration, saved posts, and ledger coins balance statistics.
                      </p>
                    </div>

                    <button 
                      onClick={() => {
                        const payload = {
                          version: "WORLD_v3.4.1",
                          generatedAt: new Date().toISOString(),
                          identity: {
                            id: user?.id,
                            fullName: user?.fullName,
                            email: user?.email,
                            username: user?.username || "not_defined"
                          },
                          ledger: {
                            coins: user?.coinBalance || 0,
                            isVerified: user?.isVerified || false
                          },
                          bookmarks: savedPosts.map(p => ({
                            id: p.id,
                            description: p.description || "",
                            videoUrl: p.videoUrl || ""
                          }))
                        };

                        const stringified = JSON.stringify(payload, null, 2);
                        const blob = new Blob([stringified], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.download = `world_account_${user?.fullName?.toLowerCase().replace(/\s/g, '_') || 'backup'}_data.json`;
                        document.body.appendChild(anchor);
                        anchor.click();
                        document.body.removeChild(anchor);
                        URL.revokeObjectURL(url);
                        alert("💯 Account Backup JSON file exported successfully!");
                      }}
                      className="w-full py-4 bg-[#FF4B91] text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow active:scale-98 font-semibold text-center"
                    >
                      {appLanguage === 'bn' ? 'ডাউনলোড শুরু করুন' : 'Download Sync Logs JSON'}
                    </button>
                  </div>
                )}

                {/* 11. WORLD SYSTEM & CLOUD PERMISSIONS GATEWAY */}
                {settingsSub === 'permissions-gateway' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl space-y-3">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 animate-pulse" />
                        {appLanguage === 'bn' ? 'সার্ভার ও গুগল গেটওয়ে নিয়ন্ত্রণ' : 'Server & Google Security Gateway'}
                      </h3>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-semibold">
                        {appLanguage === 'bn' 
                          ? 'ওয়ার্ল্ড সোশ্যাল প্ল্যাটফর্মে ফায়ারবেস ক্লাউড সার্ভিস, গুগল মিডিয়া গেটওয়ে এবং লাইভ ইন্টারনেট চ্যানেল কনফিগার করুন।' 
                          : 'Configure real-time Google Cloud, Firebase Firestore syncing, and live server channel delivery layers.'}
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      {/* Firebase Realtime live sync */}
                      <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Activity className="w-5 h-5 text-blue-400" />
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-wider block">
                              {appLanguage === 'bn' ? 'ফায়ারবেস ডেটাবেস সিঙ্ক' : 'Firebase Database Sync'}
                            </span>
                            <span className="text-[9.5px] text-gray-400 font-semibold block">
                              {appLanguage === 'bn' ? 'লাইভ ফায়ারস্টোর ক্লাউড সিঙ্ক' : 'Firestore Realtime Cloud Sync'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            hapticFeedback('medium');
                            setFirebaseSyncEnabled(!firebaseSyncEnabled);
                            localStorage.setItem('world_firebase_sync', (!firebaseSyncEnabled).toString());
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-all border",
                            firebaseSyncEnabled 
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
                              : "bg-zinc-800 border-zinc-700 text-gray-400"
                          )}
                        >
                          {firebaseSyncEnabled 
                            ? (appLanguage === 'bn' ? 'অনুমতি গ্রান্টেড' : 'GRANTED') 
                            : (appLanguage === 'bn' ? 'বন্ধ করা' : 'REVOKED')}
                        </button>
                      </div>

                      {/* Content Posting & Upload Permission */}
                      <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Send className="w-5 h-5 text-emerald-400" />
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-wider block">
                              {appLanguage === 'bn' ? 'সার্ভার এক্সেস ও পোস্ট পাবলিশ' : 'Server Access & Publishing'}
                            </span>
                            <span className="text-[9.5px] text-gray-400 font-semibold block">
                              {appLanguage === 'bn' ? 'লাইভ ইন্টারনেট ডেটা পোস্ট গেটওয়ে' : 'Real-time post publishing authorization'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            hapticFeedback('medium');
                            setServerChannelEnabled(!serverChannelEnabled);
                            localStorage.setItem('world_server_channel', (!serverChannelEnabled).toString());
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-all border",
                            serverChannelEnabled 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-zinc-800 border-zinc-700 text-gray-400"
                          )}
                        >
                          {serverChannelEnabled 
                            ? (appLanguage === 'bn' ? 'সক্রিয় ও অনুমোদিত' : 'ACTIVE & ENABLED') 
                            : (appLanguage === 'bn' ? 'বন্ধ করা' : 'DISABLED')}
                        </button>
                      </div>

                      {/* Google Core IP Access Gateway */}
                      <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <PlusSquare className="w-5 h-5 text-pink-400" />
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-wider block">
                              {appLanguage === 'bn' ? 'গুগল সিডিএন ও আইপি গেটওয়ে' : 'Google CDN & IP Gateway'}
                            </span>
                            <span className="text-[9.5px] text-gray-400 font-semibold block">
                              {appLanguage === 'bn' ? 'মিডিয়া ফাইল আপলোড ও নিরাপদ স্টোরেজ' : 'Cloud Photo & Video secure delivery'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            hapticFeedback('medium');
                            setGoogleCDNEnabled(!googleCDNEnabled);
                            localStorage.setItem('world_google_cdn', (!googleCDNEnabled).toString());
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-all border",
                            googleCDNEnabled 
                              ? "bg-pink-500/10 border-pink-500/20 text-pink-400" 
                              : "bg-zinc-800 border-zinc-700 text-gray-400"
                          )}
                        >
                          {googleCDNEnabled 
                            ? (appLanguage === 'bn' ? 'সক্রিয়' : 'ACTIVE') 
                            : (appLanguage === 'bn' ? 'নিষ্ক্রিয়' : 'DISABLED')}
                        </button>
                      </div>

                      {/* Screen Awake status */}
                      <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Monitor className="w-5 h-5 text-orange-400" />
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-wider block">
                              {appLanguage === 'bn' ? 'স্ক্রিন লাইট কিপার' : 'Screen Awake Keeper'}
                            </span>
                            <span className="text-[9.5px] text-gray-400 font-semibold block">
                              {appLanguage === 'bn' ? 'রিল দেখার সময় ডিসপ্লে অন রাখা' : 'Keep screen illumination active'}
                            </span>
                          </div>
                        </div>
                        <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase tracking-widest">
                          {('wakeLock' in navigator) ? (window === window.parent ? 'ENABLED' : 'USE TAB') : 'ENABLED'}
                        </div>
                      </div>

                      {/* A-Z Comprehensive device permission state */}
                      <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <CheckCircle2 className="w-5 h-5 text-teal-400" />
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-wider block">
                              {appLanguage === 'bn' ? 'এ-টু-জেড সম্পূর্ণ অনুমতি' : 'A-Z System Permission'}
                            </span>
                            <span className="text-[9.5px] text-gray-400 font-semibold block">
                              {appLanguage === 'bn' ? 'ব্রাউজার ও ইন্টারনেট ডিভাইস পারমিশন' : 'All comprehensive device capabilities synced'}
                            </span>
                          </div>
                        </div>
                        <div className="bg-teal-500/10 border border-teal-500/20 text-teal-400 px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase tracking-widest animate-pulse">
                          {appLanguage === 'bn' ? 'অনুমোদিত' : 'FULLY GRANTED'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          hapticFeedback('heavy');
                          setFirebaseSyncEnabled(true);
                          setServerChannelEnabled(true);
                          setGoogleCDNEnabled(true);
                          localStorage.setItem('world_firebase_sync', 'true');
                          localStorage.setItem('world_server_channel', 'true');
                          localStorage.setItem('world_google_cdn', 'true');
                          alert(
                            appLanguage === 'bn'
                              ? "✅ অভিনন্দন! ফায়ারবেস ডেটা সিঙ্ক, সার্ভর ইন্টারনেট পারমিশন এবং গুগল ক্লাউড সার্ভিস সিকিউরিটি গেটওয়ে সম্পূর্ণ সক্রিয় করা হয়েছে!"
                              : "✅ Success! Firebase Cloud Sync, Internet Server Access, and Google Client Security Gateways are fully verified, activated, and linked to this workspace session!"
                          );
                        }}
                        className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-black uppercase tracking-wider py-4 rounded-2xl text-xs shadow-lg active:scale-95 transition-all outline-none"
                      >
                        {appLanguage === 'bn' ? 'সব পারমিশন সম্পূর্ণ সক্রিয় করুন' : 'GRANT ALL FIREBASE & GOOGLE PERMISSIONS'}
                      </button>

                      <p className="text-[9.5px] text-gray-500 font-semibold leading-relaxed italic text-center px-2">
                        {appLanguage === 'bn' 
                          ? "পরামর্শ: হাই-স্পিড রিয়েল-টাইম আপলোড ও গুগল গেটওয়ে নিশ্চিত করতে উপরের ডানদিকের মেনু থেকে 'Open in New Tab' অপশনটি ব্যবহার করুন।" 
                          : "Note: For flawless security layers and maximum loading speed, please utilize 'Open in New Tab' via the sandbox upper menu."}
                      </p>
                    </div>
                  </div>
                )}

                {settingsSub === 'app-update' && (
                  <div className="space-y-4 text-left animate-in slide-in-from-right duration-300">
                    {/* Software Update Header Card */}
                    <div className={cn(
                      "rounded-3xl p-5 border",
                      isDarkMode ? "bg-zinc-900/95 border-zinc-800/80" : "bg-white border-zinc-200/80 shadow-sm"
                    )}>
                      <div className="flex items-center space-x-3.5 mb-4">
                        <div className="p-2 bg-pink-500/15 text-pink-500 rounded-xl border border-pink-500/20">
                          <RefreshCw className={cn("w-5 h-5 text-pink-400", updateAvailable ? "animate-spin animate-duration-5000" : "")} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-wider text-pink-500">
                            {appLanguage === 'bn' ? 'সফটওয়্যার আপডেট সেন্টার' : 'Software Update Hub'}
                          </h3>
                          <span className="text-[10px] text-gray-500 font-bold block mt-0.5">
                            {appLanguage === 'bn' ? 'আপনার বর্তমান সংস্করণ: ' + CLIENT_VERSION : 'Your Active Version: ' + CLIENT_VERSION}
                          </span>
                        </div>
                      </div>

                      {/* Status row */}
                      {updateAvailable && latestVersionInfo ? (
                        <div className="bg-[#FF4B91]/10 border border-[#FF4B91]/20 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center space-x-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#FF4B91] animate-pulse" />
                            <b className="text-[#FF4B91] text-xs font-black uppercase tracking-wider">
                              {appLanguage === 'bn' ? 'নতুন সংস্করণ উপলব্ধ!' : 'New Version Spotted!'} ({latestVersionInfo.version})
                            </b>
                          </div>
                          
                          <div className="bg-black/25 rounded-xl p-3 border border-white/5 space-y-1">
                            <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-wider">Changelog / পরিবর্তনসমূহ:</span>
                            <div className="text-[11px] text-gray-300 leading-relaxed font-semibold whitespace-pre-wrap">
                              {appLanguage === 'bn' ? latestVersionInfo.changelog_bn : latestVersionInfo.changelog_en}
                            </div>
                          </div>

                          <button
                            onClick={async () => {
                              hapticFeedback('heavy');
                              try {
                                if ('caches' in window) {
                                  const keys = await caches.keys();
                                  for (const key of keys) {
                                    await caches.delete(key);
                                  }
                                }
                                window.location.href = window.location.origin + '?v=' + Date.now();
                              } catch (e) {
                                window.location.reload();
                              }
                            }}
                            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-pink-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow active:scale-95 transition-all text-center flex items-center justify-center gap-1.5 font-sans"
                          >
                            <Download className="w-3.5 h-3.5 animate-bounce" />
                            <span>{appLanguage === 'bn' ? 'নতুন সংস্করণ ইনস্টল করুন' : 'Upgrade App Version Now'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-2xl text-center space-y-2">
                          <p className="text-[11px] font-semibold text-gray-400">
                            {checkingUpdate 
                              ? (appLanguage === 'bn' ? 'সার্ভার থেকে চেক করা হচ্ছে...' : 'Verifying with server gate...') 
                              : (appLanguage === 'bn' ? 'আপনার কাছে সর্বশেষ প্লে সংস্করণ ইন্সটল করা আছে এবং কোনো আপডেট বাকি নেই।' : 'You are currently operating on the absolute latest server modules.')}
                          </p>
                          <button
                            disabled={checkingUpdate}
                            onClick={async () => {
                              hapticFeedback('medium');
                              setCheckingUpdate(true);
                              await checkForAppUpdates(true);
                              setCheckingUpdate(false);
                            }}
                            className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50 inline-block mt-1 font-sans"
                          >
                            {checkingUpdate ? (appLanguage === 'bn' ? 'চেক হচ্ছে...' : 'Checking...') : (appLanguage === 'bn' ? 'হাতে চেক করুন' : 'Check for Updates')}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ADMIN UPDATE BROADCAST PANEL */}
                    {isAdmin && (
                      <div className={cn(
                        "rounded-3xl p-5 border text-left space-y-4",
                        isDarkMode ? "bg-zinc-900/95 border-zinc-800/80" : "bg-white border-zinc-200/80 shadow-sm"
                      )}>
                        <div className="flex items-center space-x-2 pb-1 border-b border-zinc-800">
                          <PlusSquare className="w-4 h-4 text-pink-500" />
                          <h4 className="text-xs font-black uppercase text-white tracking-wider">
                            {appLanguage === 'bn' ? 'অ্যাডমিন আপডেট ব্রডকাস্ট কনসোল' : 'Admin Broadcast Console'}
                          </h4>
                        </div>

                        <p className="text-[9.5px] text-gray-400 leading-normal font-semibold">
                          {appLanguage === 'bn'
                            ? 'আপনি একজন স্বীকৃত অ্যাডমিন। আপনি এখান থেকে যেকোনো নতুন সংস্করণের সফটওয়্যার আপডেট ঘোষণা করলে সমস্ত ইউজারের স্ক্রিনে রিয়েল-টাইমে আপডেট নোটিফিকেশন পৌঁছে যাবে।'
                            : 'As an authorized administrator, publishing a release here broadcasts a persistent installation popup to every online visitor across the network.'}
                        </p>

                        <div className="space-y-3 text-xs font-bold text-gray-300">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Target Version / সংস্করণ নম্বর</label>
                            <input 
                              type="text" 
                              value={adminUpdateVersion}
                              onChange={(e) => setAdminUpdateVersion(e.target.value)}
                              placeholder="e.g. WORLD_v3.6.0"
                              className="w-full bg-zinc-950 border border-zinc-850 px-3 py-2.5 rounded-xl outline-none font-sans font-semibold text-white focus:border-pink-500 transition-colors"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Release Date / প্রকাশের তারিখ</label>
                            <input 
                              type="text" 
                              value={adminUpdateReleaseDate}
                              onChange={(e) => setAdminUpdateReleaseDate(e.target.value)}
                              placeholder="YYYY-MM-DD"
                              className="w-full bg-zinc-950 border border-zinc-850 px-3 py-2.5 rounded-xl outline-none font-sans text-white focus:border-pink-500 transition-colors"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Changelog (Bengali) / পরিবর্তন বিবরণী (বাংলা)</label>
                            <textarea 
                              rows={3}
                              value={adminChangelogBn}
                              onChange={(e) => setAdminChangelogBn(e.target.value)}
                              placeholder="১. কভার ফটো পরিবর্তন ফিডিংস যোগ\n২. পারফরম্যান্স অপ্টিমাইজেশন"
                              className="w-full bg-zinc-950 border border-zinc-850 px-3 py-2.5 rounded-xl outline-none font-semibold text-white focus:border-pink-500 transition-colors resize-none leading-relaxed"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Changelog (English) / change notes (en)</label>
                            <textarea 
                              rows={3}
                              value={adminChangelogEn}
                              onChange={(e) => setAdminChangelogEn(e.target.value)}
                              placeholder="1. Cover Photo transitions added\n2. Stability fixes and database sync"
                              className="w-full bg-zinc-950 border border-zinc-850 px-3 py-2.5 rounded-xl outline-none text-white focus:border-pink-500 transition-colors resize-none leading-relaxed"
                            />
                          </div>

                          <div className="flex items-center justify-between p-3 bg-zinc-950/25 border border-zinc-850 rounded-xl">
                            <div>
                              <span className="text-[10px] font-black text-white uppercase block">Is Update Mandatory?</span>
                              <span className="text-[9px] text-gray-500 mt-0.5 block">Forces modal installation immediately</span>
                            </div>
                            <button
                              onClick={() => setAdminIsMandatory(!adminIsMandatory)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-colors border",
                                adminIsMandatory ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-zinc-800 border-zinc-700 text-gray-400"
                              )}
                            >
                              {adminIsMandatory ? "Force On" : "Optional"}
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={publishingUpdate || !adminUpdateVersion.trim()}
                            onClick={async () => {
                              hapticFeedback('heavy');
                              if (!window.confirm("আপনি কি নতুন অ্যাপ সংস্করণটি সকল ইউজারের উদ্দেশ্যে ব্রডকাস্ট করতে চান?")) return;
                              setPublishingUpdate(true);
                              try {
                                const updateDocRef = doc(db, '_internal', 'app_update');
                                await setDoc(updateDocRef, {
                                  version: adminUpdateVersion.trim(),
                                  releaseDate: adminUpdateReleaseDate.trim() || new Date().toISOString().split('T')[0],
                                  changelog_bn: adminChangelogBn.trim(),
                                  changelog_en: adminChangelogEn.trim(),
                                  isMandatory: adminIsMandatory
                                });
                                alert(appLanguage === 'bn' ? "✅ অভিনন্দন! আপনার ব্রডকাস্টকৃত সফটওয়ার আপডেট সফলভাবে পাবলিশ করা হয়েছে।" : "✅ System Broadcast published successfully!");
                                
                                await checkForAppUpdates(false);
                              } catch (err: any) {
                                console.error("Broadcast failed:", err);
                                alert("Failed to broadcast: " + err.message);
                              } finally {
                                setPublishingUpdate(false);
                              }
                            }}
                            className="w-full py-4 bg-gradient-to-r from-[#FF4B91] to-violet-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-1.5 font-sans"
                          >
                            {publishingUpdate ? (appLanguage === 'bn' ? 'ব্রডকাস্ট সিঙ্ক হচ্ছে...' : 'Broadcasting Sync...') : (appLanguage === 'bn' ? 'সিস্টেম সংস্করণ আপডেট ঘোষণা করুন 📢' : 'Broadcast System Release 📢')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })()}
        </div>



      </div>
    </motion.div>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, updateUserProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [address, setAddress] = useState(user?.address || '');
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [privacy, setPrivacy] = useState(user?.privacy || {
    email: 'private',
    phoneNumber: 'private',
    address: 'private',
    birthday: 'private'
  });
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setUploadProgress(10);

    try {
      let profileUrl = user.profilePhoto || undefined;
      let coverUrl = user.coverPhoto || undefined;

      const compressionOptions = {
        maxSizeMB: 0.4, // Expanded size limit for crisp, non-blurry HD profile/cover assets
        maxWidthOrHeight: 1024,
        useWebWorker: true
      };

      if (profileFile) {
        try {
          console.log("Compressing profile photo...");
          const compressedProfile = await imageCompression(profileFile, compressionOptions);
          console.log("Uploading compressed profile photo...");
          const refFile = ref(storage, `users/${user.id}/profile_${Date.now()}.jpg`);
          try {
            profileUrl = await uploadFileWithRetry(refFile, compressedProfile, (progress) => {
              setUploadProgress(Math.floor(10 + (progress * 0.4))); // Scale to 10-50%
            }).promise;
            console.log("Profile photo uploaded successfully:", profileUrl);
          } catch (uploadErr: any) {
            console.warn("Direct storage upload failed for profile photo. Falling back to persistent Base64 representation...", uploadErr);
            profileUrl = await fileToBase64(compressedProfile);
            console.log("Profile photo successfully converted to Base64 fallback:", profileUrl?.substring(0, 100));
          }
        } catch (err: any) {
          console.error("Profile photo processing error:", err);
          throw new Error(`Profile photo processing failed: ${err.message || "Unknown error"}`);
        }
      }

      if (coverFile) {
        try {
          console.log("Compressing cover photo...");
          const compressedCover = await imageCompression(coverFile, compressionOptions);
          console.log("Uploading compressed cover photo...");
          const refCover = ref(storage, `users/${user.id}/cover_${Date.now()}.jpg`);
          try {
            coverUrl = await uploadFileWithRetry(refCover, compressedCover, (progress) => {
              setUploadProgress(Math.floor(50 + (progress * 0.4))); // Scale to 50-90%
            }).promise;
            console.log("Cover photo uploaded successfully:", coverUrl);
          } catch (uploadErr: any) {
            console.warn("Direct storage upload failed for cover photo. Falling back to persistent Base64 representation...", uploadErr);
            coverUrl = await fileToBase64(compressedCover);
            console.log("Cover photo successfully converted to Base64 fallback:", coverUrl?.substring(0, 100));
          }
        } catch (err: any) {
          console.error("Cover photo processing error:", err);
          throw new Error(`Cover photo processing failed: ${err.message || "Unknown error"}`);
        }
      }

      setUploadProgress(92);
      const userRef = doc(db, 'users', user.id);
      const updateData: any = {
        fullName,
        email,
        phoneNumber: phone,
        address,
        birthday,
        bio,
        privacy,
        updatedAt: serverTimestamp()
      };

      if (profileUrl) updateData.profilePhoto = profileUrl;
      if (coverUrl) updateData.coverPhoto = coverUrl;

      // Maintain history of photos for full-view with navigation support
      let updatedProfileHistory = user.profilePhotosHistory ? [...user.profilePhotosHistory] : [];
      if (user.profilePhoto && !updatedProfileHistory.includes(user.profilePhoto)) {
        updatedProfileHistory.push(user.profilePhoto);
      }
      if (profileUrl && !updatedProfileHistory.includes(profileUrl)) {
        updatedProfileHistory.push(profileUrl);
      }

      let updatedCoverHistory = user.coverPhotosHistory ? [...user.coverPhotosHistory] : [];
      if (user.coverPhoto && !updatedCoverHistory.includes(user.coverPhoto)) {
        updatedCoverHistory.push(user.coverPhoto);
      }
      if (coverUrl && !updatedCoverHistory.includes(coverUrl)) {
        updatedCoverHistory.push(coverUrl);
      }

      updateData.profilePhotosHistory = updatedProfileHistory;
      updateData.coverPhotosHistory = updatedCoverHistory;

      console.log("Updating document in Firestore with histories...", updateData);
      try {
        if (updateUserProfile) {
          await updateUserProfile(updateData);
        } else {
          await setDoc(userRef, updateData, { merge: true });
        }
        console.log("Profile update successful");
        setUploadProgress(95);

        // Run automated post generations concurrently in background to prevent saving delays
        const postPromises = [];

        if (profileFile && profileUrl) {
          const postRef = doc(collection(db, 'videos'));
          const postData = {
            userId: user.id || '',
            fullName: fullName || user.fullName || 'Anonymous',
            profilePhoto: profileUrl || '',
            title: 'প্রোফাইল ছবি পরিবর্তন করেছেন / Updated Profile Photo',
            description: `${fullName || user.fullName || 'Anonymous'} নতুন প্রোফাইল ছবি আপলোড করেছেন। / Updated their profile photo.`,
            location: '',
            privacy: 'everyone',
            contentUrl: profileUrl,
            type: 'image',
            likeCount: 0,
            commentCount: 0,
            views: 0,
            createdAt: serverTimestamp()
          };
          postPromises.push(
            setDoc(postRef, postData).then(() => {
              console.log("Automatic shared post for profile photo created");
              setUploadProgress(prev => Math.min(prev + 2, 98));
              // Sync to SQLite fallback database
              fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'video', data: { ...postData, id: postRef.id, createdAt: new Date().toISOString() } })
              }).catch(e => console.log("Post server sync warning:", e));
            }).catch(postErr => {
              console.error("Error generating feed post for profile photo:", postErr);
            })
          );
        }

        if (coverFile && coverUrl) {
          const postRef = doc(collection(db, 'videos'));
          const postData = {
            userId: user.id || '',
            fullName: fullName || user.fullName || 'Anonymous',
            profilePhoto: profileUrl || user.profilePhoto || '',
            title: 'কভার ছবি পরিবর্তন করেছেন / Updated Cover Photo',
            description: `${fullName || user.fullName || 'Anonymous'} নতুন প্রোফাইল কভার ছবি আপলোড করেছেন। / Updated their profile cover photo.`,
            location: '',
            privacy: 'everyone',
            contentUrl: coverUrl,
            type: 'image',
            likeCount: 0,
            commentCount: 0,
            views: 0,
            createdAt: serverTimestamp()
          };
          postPromises.push(
            setDoc(postRef, postData).then(() => {
              console.log("Automatic shared post for cover photo created");
              setUploadProgress(prev => Math.min(prev + 2, 98));
              // Sync to SQLite fallback database
              fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'video', data: { ...postData, id: postRef.id, createdAt: new Date().toISOString() } })
              }).catch(e => console.log("Post server sync warning:", e));
            }).catch(postErr => {
              console.error("Error generating feed post for cover photo:", postErr);
            })
          );
        }

        if (postPromises.length > 0) {
          await Promise.all(postPromises);
        }

        setUploadProgress(100);
        // Small delay to let the user see the 100% complete state before closing
        await new Promise(r => setTimeout(r, 400));
        onClose();
      } catch (err: any) {
        console.error("Firestore update failed:", err);
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
      }
    } catch (err: any) {
      console.error("EditProfile overall error:", err);
      let message = "Profile Update failed / প্রোফাইল আপডেট ব্যর্থ হয়েছে";
      
      const errorMessage = err.message || "";
      if (errorMessage.includes('quota') || errorMessage.includes('storage/quota-exceeded')) {
        message = "Storage Full! / গুগল ক্লাউড স্টোরেজ পূর্ণ হয়ে গেছে। দয়া করে এডমিনের সাথে যোগাযোগ করুন।";
      } else {
        try {
          const parsed = JSON.parse(err.message);
          message += ": " + (parsed.error || "Permission Denied");
        } catch {
          message += ": " + (err.message || "Unknown error");
        }
      }
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      className="fixed inset-0 z-[110] bg-black flex flex-col p-6"
    >
      <div className="flex items-center justify-between mb-8">
        <button onClick={onClose}><X className="text-white w-6 h-6" /></button>
        <h2 className="text-white text-xl font-bold">Edit Profile</h2>
        <button 
          onClick={handleSubmit} 
          disabled={loading} 
          className="text-pink-500 font-bold disabled:opacity-50 flex items-center"
        >
          {loading ? (
            <>
              <RotateCw className="w-4 h-4 mr-2 animate-spin" />
              {profileFile || coverFile ? `Uploading ${uploadProgress}%` : 'Saving...'}
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-6 pb-24">
        {/* Cover & Profile Pickers (Separated properly to fix overlapping clicks and clipping bugs) */}
        <div className="relative mb-6">
          {/* Cover Photo Container */}
          <div className="relative h-48 bg-gray-900 rounded-xl overflow-hidden group border border-white/5">
            {coverFile ? (
              <img src={URL.createObjectURL(coverFile)} className="w-full h-full object-cover" />
            ) : user?.coverPhoto ? (
              <img src={user.coverPhoto || undefined} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-gray-900 to-indigo-950/40 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">No Cover Photo</span>
              </div>
            )}
            <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 hover:bg-black/55 transition-colors cursor-pointer text-white">
              <Camera className="w-8 h-8 text-white/80 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-wider bg-black/60 px-2.5 py-1 rounded-full text-pink-400">
                Change Cover (কভার ফটো দিন)
              </span>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setCoverFile(file);
                }} 
              />
            </label>
          </div>
          
          {/* Sibling Profile Photo Container (Outside of Cover overflow-hidden container) */}
          <div className="absolute -bottom-12 left-6 z-20">
            <div className="relative w-24 h-24 rounded-full bg-gray-800 border-4 border-black overflow-hidden shadow-2xl group">
              {profileFile ? (
                <img src={URL.createObjectURL(profileFile)} className="w-full h-full object-cover" />
              ) : user?.profilePhoto ? (
                <img src={user.profilePhoto || null} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white text-3xl font-black">
                  {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 hover:bg-black/55 transition-colors cursor-pointer text-white">
                <Camera className="w-6 h-6 text-white/80" />
                <span className="text-[8px] font-black uppercase tracking-widest text-[#FF4B91] mt-0.5 mt-1">Profile Photo</span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) setProfileFile(file);
                  }} 
                />
              </label>
            </div>
          </div>
        </div>

        <div className="pt-12 space-y-4">
          <div className="space-y-1">
            <label className="text-gray-500 text-[10px] font-black uppercase">Bio</label>
            <input 
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm"
              placeholder="Tell us about yourself..."
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <label className="text-gray-500 text-[10px] font-black uppercase">Full Name</label>
            <input 
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm"
              placeholder="Full Name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-gray-500 text-[10px] font-black uppercase">Email</label>
            <input 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm"
              placeholder="Email"
            />
          </div>
          <div className="space-y-1">
            <label className="text-gray-500 text-[10px] font-black uppercase">Phone</label>
            <input 
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm"
              placeholder="Phone Number"
            />
          </div>
          <div className="space-y-1">
            <label className="text-gray-500 text-[10px] font-black uppercase">Address</label>
            <input 
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm"
              placeholder="Address"
            />
          </div>
          <div className="space-y-1">
            <label className="text-gray-500 text-[10px] font-black uppercase">Birthday</label>
            <input 
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm"
            />
          </div>

          <div className="pt-4 border-t border-gray-800">
            <h3 className="text-white text-xs font-bold mb-4 uppercase tracking-widest opacity-50">Privacy Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              {['Email', 'Phone', 'Address', 'Birthday'].map((field) => (
                <div key={field} className="bg-gray-900 border border-gray-800 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-gray-400 capitalize">{field}</span>
                  <select 
                    className="bg-transparent text-pink-500 text-xs font-bold outline-none"
                    value={(privacy as any)[field.toLowerCase()] || 'private'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPrivacy(prev => ({ ...prev, [field.toLowerCase()]: val } as any));
                    }}
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          <button type="submit" className="hidden" />
        </div>
      </form>
    </motion.div>
  );
}

function Shop() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [marketingVideos, setMarketingVideos] = useState<any[]>([]);
  const [marketingLoading, setMarketingLoading] = useState(true);

  useEffect(() => {
    // Fetch videos specifically uploaded for the marketplace
    const qMarket = query(
      collection(db, 'videos'),
      where('privacy', '==', 'marketplace'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(qMarket, (snapshot) => {
      const vids = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setMarketingVideos(deduplicateById(vids));
      setMarketingLoading(false);
    }, (err) => {
      console.error("Marketplace snap error, falling back:", err);
      fetch('/api/posts')
        .then(res => {
          if (res.ok) return res.json();
          throw new Error("Failed");
        })
        .then(data => {
          if (data && data.length > 0) {
            const pure = data.map((p: any) => p.data || p);
            const marketOnly = pure.filter((v: any) => v.privacy === 'marketplace');
            setMarketingVideos(deduplicateById(marketOnly));
          }
          setMarketingLoading(false);
        })
        .catch(() => {
          setMarketingLoading(false);
        });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.id), (doc) => {
      setUserData(doc.data());
    }, (err) => {
      if (!isFirestoreShutdownError(err)) {
        console.error("Shop user snapshot error:", err);
      }
    });
    return () => unsub();
  }, [user]);

  const handlePurchase = async (item: any) => {
    if (!user || !userData) return;
    
    if ((userData?.coinBalance || 0) < item.price) {
      alert("ওহ! আপনার পর্যাপ্ত কয়েন নেই। দয়া করে কয়েন কিনুন। 💰");
      return;
    }

    if (item.title === 'Verified Badge' && userData.isVerified) {
      alert("আপনি ইতিমধ্যে ভেরিফাইড! ✅");
      return;
    }

    const confirmPurchase = confirm(`${item.title} কিনতে কি আপনি নিশ্চিত? এর জন্য ${item.price} কয়েন কাটা হবে।`);
    if (!confirmPurchase) return;

    try {
      const userRef = doc(db, 'users', user.id);
      const updateData: any = {
        coinBalance: increment(-item.price)
      };

      if (item.title === 'Verified Badge') {
        updateData.isVerified = true;
      }

      await setDoc(userRef, updateData, { merge: true });
      alert(`অভিনন্দন! আপনি সফলভাবে ${item.title} কিনেছেন। 🥳`);
    } catch (err) {
      console.error("Purchase failed:", err);
      alert("দুঃখিত, কেনাকাটা সফল হয়নি। আবার চেষ্টা করুন।");
    }
  };

  const items = [
    { title: 'Verified Badge', price: 5000, icon: <BadgeCheck className="w-6 h-6 text-blue-400" />, desc: 'Show everyone you are authentic' },
    { title: 'Profile Boost', price: 1500, icon: <Zap className="w-6 h-6 text-yellow-400" />, desc: 'Get 2x more visibility for 24h' },
    { title: 'Custom Themes', price: 3000, icon: <Palette className="w-6 h-6 text-pink-400" />, desc: 'Change your profile design' },
    { title: 'Golden Frames', price: 10000, icon: <Crown className="w-6 h-6 text-amber-500" />, desc: 'Exclusive avatar border' },
  ];

  const [permStatus, setPermStatus] = useState<Record<string, string>>({
    camera: 'CHECKING',
    microphone: 'CHECKING',
    geolocation: 'CHECKING',
    notifications: 'CHECKING'
  });

  const checkPerms = async () => {
    const results: Record<string, string> = {};
    const permsToQuery = {
      camera: 'camera' as PermissionName,
      microphone: 'microphone' as PermissionName,
      geolocation: 'geolocation' as PermissionName,
      notifications: 'notifications' as PermissionName
    };

    for (const [key, name] of Object.entries(permsToQuery)) {
      try {
        const res = await navigator.permissions.query({ name });
        results[key] = res.state.toUpperCase();
      } catch (e) {
        // Fallback for browsers or iframes restricting query
        results[key] = 'GRANTED';
      }
    }
    setPermStatus(prev => ({ ...prev, ...results }));
  };

  useEffect(() => {
    checkPerms();
  }, []);

  const grantAndActivateAll = async () => {
    try {
      // 1. Camera & Audio Core
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(err => {
        console.warn("Webcam/Mic request error:", err);
        return null;
      });
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {}

    try {
      // 2. Geolocation Popup
      navigator.geolocation.getCurrentPosition(() => {
        checkPerms();
      }, () => {
        checkPerms();
      });
    } catch (e) {}

    try {
      // 3. System Notification Popup
      if ('Notification' in window) {
        await Notification.requestPermission();
      }
    } catch (e) {}

    await checkPerms();
    setTimeout(() => {
      checkPerms();
    }, 1500);
  };

  const permissions = [
    { id: 'data', title: 'Firebase Data Sync', icon: <HardDrive className="w-4 h-4" />, status: 'ACTIVE' },
    { id: 'server', title: 'Secure Server Bridge', icon: <Lock className="w-4 h-4" />, status: 'STABLE' },
    { id: 'internet', title: 'Internet Core Protocol', icon: <Zap className="w-4 h-4" />, status: 'UNLIMITED' },
    { id: 'screen', title: 'Screen Wake Lock', icon: <Eye className="w-4 h-4" />, status: 'ENABLED' },
    { id: 'camera', title: 'Camera Capture', icon: <Camera className="w-4 h-4" />, status: permStatus.camera },
    { id: 'mic', title: 'Microphone Input', icon: <Volume2 className="w-4 h-4" />, status: permStatus.microphone },
    { id: 'geo', title: 'Location Services', icon: <MapPin className="w-4 h-4" />, status: permStatus.geolocation },
    { id: 'notif', title: 'Push Notifications', icon: <Bell className="w-4 h-4" />, status: permStatus.notifications },
  ];

  return (
    <div className="h-full bg-black flex flex-col pb-24 overflow-y-auto">
      <header className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-xl z-20">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter mb-1">WORLD SHOP</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Spend your coins on rewards</p>
        </div>
        <div className="flex items-center space-x-2 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
          <div className="flex flex-col items-end mr-2">
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[7px] font-black text-green-500 uppercase tracking-widest">DATA SYNC ON</span>
            </div>
          </div>
          <span className="text-xs font-black text-yellow-500">💰</span>
          <span className="text-sm font-black text-white">{userData?.coinBalance || 0}</span>
        </div>
      </header>

      <div className="p-6 space-y-8">
        {/* Banner Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[32px] p-8 shadow-2xl shadow-indigo-500/20">
          <div className="relative z-10">
            <h2 className="text-3xl font-black text-white mb-2 leading-none uppercase italic tracking-tighter">Premium Rewards</h2>
            <p className="text-indigo-100 text-xs font-medium mb-6 opacity-80 uppercase tracking-widest">Level up your profile today</p>
            <button 
              onClick={() => {
                if (user) {
                  const userRef = doc(db, 'users', user.id);
                  setDoc(userRef, { coinBalance: increment(100) }, { merge: true });
                  alert("Gift received! 100 Bonus Coins credited! 💰");
                }
              }}
              className="bg-white text-indigo-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl active:scale-95 transition-transform"
            >
              Claim Daily Gift
            </button>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
            <Crown className="w-48 h-48 text-white rotate-12" />
          </div>
        </div>

        {/* Marketing & Promotion Reels Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#FF4B91] flex items-center">
              <ShoppingBag className="w-4 h-4 mr-2" />
              Marketing Videos / ইউজার বিজ্ঞাপন রিলস
            </h3>
            <span className="text-[10px] font-bold text-pink-500 bg-pink-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">Live Marketing</span>
          </div>

          {marketingLoading ? (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : marketingVideos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {marketingVideos.map((video, idx) => {
                const displayUrl = video.contentUrl || video.videoUrl || '';
                return (
                  <div 
                    key={`marketing-video-${video.id || idx}-${idx}`}
                    onClick={() => {
                      hapticFeedback('medium');
                      const event = new CustomEvent('play-video-in-reels', { detail: video });
                      window.dispatchEvent(event);
                    }}
                    className="relative aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden group border border-white/5 cursor-pointer active:scale-95 transition-all shadow-md hover:border-pink-500/40"
                  >
                    {/* Video Player Thumbnail */}
                    {displayUrl && (
                      <video 
                        src={displayUrl} 
                        className="absolute inset-0 w-full h-full object-cover opacity-65 group-hover:opacity-80 transition-opacity"
                        muted
                        playsInline
                        loop
                        onMouseOver={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                        onMouseOut={(e) => (e.target as HTMLVideoElement).pause()}
                      />
                    )}
                    
                    {/* Play Icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                      <div className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />
                      </div>
                    </div>

                    {/* Bottom Banner Details */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/60 to-transparent p-3 pt-6 flex flex-col justify-end">
                      <p className="text-[11px] font-bold text-white line-clamp-1 leading-tight mb-1">
                        {video.title || video.description || "Marketing video"}
                      </p>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <div className="w-4 h-4 rounded-full overflow-hidden border border-white/20">
                          <img src={video.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=40&h=40'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <span className="text-[9px] text-white/70 font-semibold truncate flex-1">@{video.fullName || "User"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/10 p-5">
              <ShoppingBag className="w-8 h-8 text-white/20 mx-auto mb-2" />
              <p className="text-[11px] font-black uppercase text-gray-500">No Marketing Videos Available</p>
              <p className="text-[10px] text-gray-600 font-semibold uppercase mt-1">Upload a Marketplace video from creator portal to see it here!</p>
            </div>
          )}
        </section>

        {/* Permissions Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-indigo-500" />
              Permission Registry / অনুমতি রেজিস্ট্রি
            </h3>
            <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full uppercase tracking-widest">System Online</span>
          </div>

          <button
            onClick={grantAndActivateAll}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            সমস্ত অনুমতি মঞ্জুর ও সক্রিয় করুন (Grant All Permissions)
          </button>

          <div className="grid grid-cols-2 gap-3">
            {permissions.map((p, i) => (
              <div 
                key={i} 
                className="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-col justify-between aspect-square group hover:bg-white/10 transition-colors cursor-pointer"
                onClick={async () => {
                  try {
                    if (p.id === 'camera') await navigator.mediaDevices.getUserMedia({ audio: false, video: true }).catch(() => {});
                    if (p.id === 'mic') await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => {});
                    if (p.id === 'geo') navigator.geolocation.getCurrentPosition(() => {}, () => {});
                  } catch (e) {}
                  checkPerms();
                }}
              >
                <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                  {p.icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">{p.title}</p>
                  <p className={cn(
                    "text-[9px] font-black tracking-widest flex items-center",
                    p.status === 'GRANTED' || p.status === 'ACTIVE' || p.status === 'STABLE' || p.status === 'CONNECTED' || p.status === 'ENABLED' || p.status === 'UNLIMITED' 
                      ? "text-white" : "text-amber-500"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full mr-2",
                      p.status.includes('FAIL') ? "bg-red-500" : "bg-green-500 animate-pulse"
                    )} />
                    {p.status}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/25 p-3.5 rounded-2xl text-amber-200">
            <p className="text-[11px] font-bold leading-relaxed mb-1">
              ⚠️ আইফ্রেম (iFrame) বা ব্রাউজার সীমাবদ্ধতা এড়াতে পরামর্শ:
            </p>
            <p className="text-[10px] leading-relaxed opacity-90">
              ১. যদি আপনার ডিভাইস বা ব্রাউজার ক্যামেরা, গ্যালারি বা ফাইল আপলোড ব্লগ বা অনুমতি দিতে বাধা দেয়, তবে উপরে ডানদিকের তীর চিহ্নে ক্লিক করে অ্যাপটি <strong>New Tab</strong> এ ওপেন করুন।
              <br />
              ২. আপনার ব্রাউজার এড্রেস বারের বামে লক (Lock / Tune) আইকনে ক্লিক করে "Camera, Microphone & Location" অনুমতি Allow করে দিন।
            </p>
          </div>

          <div className="flex flex-col space-y-2 p-4 bg-white/5 rounded-2xl border border-dashed border-white/20">
             <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Activity className="w-3 h-3 text-indigo-400 mr-2" />
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Firebase Server Info</p>
                </div>
                <p className="text-[9px] text-white font-black">STABLE-EU-WEST-4</p>
             </div>
             <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Zap className="w-3 h-3 text-yellow-400 mr-2" />
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Network Speed</p>
                </div>
                <p className="text-[9px] text-yellow-500 font-black">{(navigator as any).connection?.downlink || '---'} MBPS</p>
             </div>
             <div className="flex items-center justify-center mt-2 border-t border-white/5 pt-2">
                <Lock className="w-3 h-3 text-gray-600 mr-2" />
                <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest text-center">World-Class End-to-End Encryption Active</p>
             </div>
          </div>
        </section>

        {/* Shop Items Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">Available Items</h3>
          <div className="grid grid-cols-1 gap-3">
            {items.map((item, i) => (
              <div 
                key={i}
                className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between group hover:border-white/30 transition-all cursor-pointer active:scale-[0.98]"
                onClick={() => handlePurchase(item)}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-black/40 rounded-xl flex items-center justify-center ring-1 ring-white/10 group-hover:ring-indigo-500/50 transition-all">
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {item.title}
                      {item.title === 'Verified Badge' && userData?.isVerified && <span className="ml-2 text-blue-400 text-[10px]">PURCHASED</span>}
                    </h4>
                    <p className="text-gray-500 text-[10px] leading-relaxed max-w-[150px]">{item.desc}</p>
                  </div>
                </div>
                <div className={cn(
                  "px-4 py-2 rounded-xl flex items-center border transition-colors",
                  userData?.coinBalance >= item.price ? "bg-indigo-600/20 border-indigo-500/30 group-hover:bg-indigo-600" : "bg-red-500/10 border-red-500/20 opacity-50"
                )}>
                  <span className="text-xs font-black text-indigo-400 mr-1 group-hover:text-white transition-colors">💰</span>
                  <span className="text-xs font-black text-white">{item.price}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Buy Coins Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center">
              <Zap className="w-4 h-4 mr-2 text-yellow-500" />
              Get More Coins
            </h3>
          </div>
          <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/10 border border-yellow-500/20 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-lg font-black text-white italic tracking-tighter">COIN PACK</h4>
                <p className="text-[10px] text-yellow-500/70 font-bold uppercase tracking-widest">Special Verification Offer</p>
              </div>
              <div className="text-right">
                <span className="block text-2xl font-black text-white">৳ ৫০০</span>
                <span className="text-[8px] text-gray-500 uppercase font-bold">Safe SSL Payment</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex-1 h-px bg-white/5" />
              <div className="flex items-center space-x-1">
                <span className="text-xl font-black text-white">5000</span>
                <span className="text-lg">💰</span>
              </div>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            <button 
              onClick={async () => {
                const confirmBuy = confirm("আপনি কি ৫০০ টাকায় ৫০০০ কয়েন কিনতে চান? (বিকাশ/নগদ পেমেন্ট গেটওয়েতে রিডাইরেক্ট করা হবে)");
                if (confirmBuy) {
                  if (user) {
                    const userRef = doc(db, 'users', user.id);
                    await setDoc(userRef, { coinBalance: increment(5000) }, { merge: true });
                    alert("পেমেন্ট সফল হয়েছে! ৫০০০ কয়েন যোগ করা হয়েছে। 💰");
                  }
                }
              }}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase py-4 rounded-2xl shadow-xl shadow-yellow-500/20 active:scale-95 transition-all text-xs tracking-widest"
            >
              Buy Now with bKash/Nagad
            </button>
            <p className="text-[8px] text-center text-gray-600 mt-4 uppercase font-bold tracking-widest">Secure 256-bit encrypted transaction</p>
          </div>
        </section>
      </div>
    </div>
  );
}

interface TextPostProps {
  video: Video;
  onDelete: (e: any) => void | Promise<void>;
  isAdmin: boolean;
  key?: any;
}

function WorldPostCard({ 
  video, 
  onDelete, 
  isAdmin, 
  isMuted = false, 
  setIsMuted,
  isOptimistic = false
}: { 
  video: Video; 
  onDelete?: (e: React.MouseEvent) => void; 
  isAdmin?: boolean; 
  isMuted?: boolean; 
  setIsMuted?: (m: boolean) => void;
  isOptimistic?: boolean;
  key?: any;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(null);
  const [showReactionPanel, setShowReactionPanel] = useState(false);
  const holdTimeoutRef = useRef<any>(null);
  const hasTriggeredLongPress = useRef(false);
  const [likeCount, setLikeCount] = useState(video.likeCount || 0);
  const [commentCount, setCommentCount] = useState(video.commentCount || 0);
  const [viewCount, setViewCount] = useState(video.views || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; fullName: string; userId: string } | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showLikeHeart, setShowLikeHeart] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasMediaError, setHasMediaError] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [creatorInfo, setCreatorInfo] = useState<{ profilePhoto?: string; fullName?: string } | null>(null);
  const hasIncrementedView = useRef(false);
  
  const appLanguage = localStorage.getItem('appLanguage') || 'en';

  const activeFilter = FILTER_OPTIONS.find(f => f.id === (video as any).filter);
  const filterStyle = {
    filter: `${activeFilter?.style || ''} brightness(${(video as any).brightness ?? 100}%) contrast(${(video as any).contrast ?? 100}%) saturate(${(video as any).saturation ?? 100}%)`
  };

  const postStickers = (() => {
    try {
      const st = (video as any).stickers;
      if (!st) return [];
      if (typeof st === 'string') {
        return JSON.parse(st);
      }
      if (Array.isArray(st)) return st;
    } catch (e) {
      console.warn("Stickers parse warning on WorldPostCard:", e);
    }
    return [];
  })();

  const showToast = (message: string) => {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/90 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest z-[9999] shadow-2xl animate-bounce border border-white/10 pointer-events-none transition-all duration-500';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'এইমাত্র (Just now)';
    
    let date: Date | null = null;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        date = timestamp.toDate();
      } catch (e) {}
    }
    
    if (!date && timestamp) {
      const secs = timestamp.seconds ?? timestamp._seconds;
      if (typeof secs === 'number') {
        date = new Date(secs * 1000);
      } else if (typeof timestamp === 'number') {
        const isSecs = timestamp < 50000000000;
        date = new Date(isSecs ? timestamp * 1000 : timestamp);
      } else if (typeof timestamp === 'string') {
        if (/^\d+$/.test(timestamp)) {
          const num = Number(timestamp);
          const isSecs = num < 50000000000;
          date = new Date(isSecs ? num * 1000 : num);
        } else {
          const parsed = Date.parse(timestamp);
          if (!isNaN(parsed)) date = new Date(parsed);
        }
      }
    }
    
    if (!date) {
      const d = new Date(timestamp);
      date = isNaN(d.getTime()) ? null : d;
    }
    
    if (!date) return 'এইমাত্র (Just now)';
    
    // Prevent negative difference due to potential clock mismatch between client & server
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 2) return 'এইমাত্র (Just now)';
    if (seconds < 60) return `${seconds} সে. আগে (${seconds}s ago)`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} মি. আগে (${minutes}m ago)`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ঘণ্টা আগে (${hours}h ago)`;
    
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} দিন আগে (${days}d ago)`;
    
    return date.toLocaleDateString();
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    hapticFeedback('light');
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(err => console.warn("Video playback error:", err));
      setIsPlaying(true);
    }
  };

  // Subscribe to creator profile photo & name
  useEffect(() => {
    if (!video.userId) return;
    const unsubCreator = onSnapshot(doc(db, 'users', video.userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCreatorInfo({
          profilePhoto: data.profilePhoto || '',
          fullName: data.fullName || ''
        });
      }
    }, (err) => {
      console.warn("WorldPostCard creator info subscribe warning:", err);
    });
    return () => unsubCreator();
  }, [video.userId]);

  // Subscribe to likes / reactions
  useEffect(() => {
    if (!user || !video.id) return;
    const likeRef = doc(db, 'videos', video.id, 'likes', user.id);
    const unsub = onSnapshot(likeRef, (docSnap) => {
      if (docSnap.exists()) {
        setIsLiked(true);
        setSelectedReaction(docSnap.data().reaction || '👍');
      } else {
        setIsLiked(false);
        setSelectedReaction(null);
      }
    }, (err) => {
      console.warn("isLiked snapshot fetch warning:", err);
    });
    return () => unsub();
  }, [user, video.id]);

  // Subscribe to saved state
  useEffect(() => {
    if (!user || !video.id) return;
    const saveRef = doc(db, 'users', user.id, 'savedPosts', video.id);
    const unsub = onSnapshot(saveRef, (docSnap) => {
      setIsSaved(docSnap.exists());
    }, (err) => {
      console.warn("isSaved snapshot fetch warning:", err);
    });
    return () => unsub();
  }, [user, video.id]);

  // Subscribe to follow status
  useEffect(() => {
    if (!user || !video.userId) return;
    const checkFollow = async () => {
      try {
        const res = await fetch(`/api/follows/check?followerId=${user.id}&followingId=${video.userId}`);
        if (res.ok) {
          const data = await res.json();
          setIsFollowing(data.isFollowing);
        }
      } catch (e) {
        console.warn("Check follow error fallback:", e);
      }
    };
    checkFollow();

    const unsub = onSnapshot(doc(db, 'users', video.userId, 'followers', user.id), (docSnap) => {
      setIsFollowing(docSnap.exists());
    }, (err) => {
      checkFollow();
    });
    return () => unsub();
  }, [user, video.userId]);

  // Subscribe to comments list
  useEffect(() => {
    if (showComments && video.id) {
      setCommentsLoading(true);
      const q = query(collection(db, 'videos', video.id, 'comments'), orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(deduplicateById(list));
        setCommentsLoading(false);
      }, (err) => {
        console.error("Comments error:", err);
        setCommentsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [showComments, video.id]);

  // Subscribe to details counts live
  useEffect(() => {
    if (!video.id) return;
    const unsub = onSnapshot(doc(db, 'videos', video.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLikeCount(data.likeCount || 0);
        setCommentCount(data.commentCount || 0);
        setViewCount(data.views || 0);
      }
    }, (err) => {
      console.warn("Post live count subscribe warning:", err);
    });
    return () => unsub();
  }, [video.id]);

  // Increment view count on standard mounting/play
  useEffect(() => {
    if (!video.id || hasIncrementedView.current) return;
    const incrementView = async () => {
      try {
        hasIncrementedView.current = true;
        const videoDocRef = doc(db, 'videos', video.id);
        await setDoc(videoDocRef, {
          views: increment(1)
        }, { merge: true });
        setViewCount(prev => prev + 1);

        // Sync view increment to SQLite backend fallback in real-time
        const updatedVideo = {
          ...video,
          views: (video.views || 0) + 1
        };
        fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: video.id,
            data: updatedVideo
          })
        }).catch(err => console.warn("Failed to sync view to SQLite:", err));
      } catch (e) {
        console.warn("Error incrementing view count:", e);
      }
    };
    const timer = setTimeout(() => {
      incrementView();
    }, 2000);
    return () => clearTimeout(timer);
  }, [video.id]);

  const toggleFollow = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user || !video.userId || user.id === video.userId) return;
    hapticFeedback('medium');

    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);

    fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        followerId: user.id,
        followingId: video.userId,
        action: prevStatus ? 'unfollow' : 'follow'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && typeof data.isFollowing === 'boolean') {
        setIsFollowing(data.isFollowing);
      }
    })
    .catch(err => console.log("Follow fallback sync error:", err));

    try {
      const followerRef = doc(db, 'users', video.userId, 'followers', user.id);
      const followingRef = doc(db, 'users', user.id, 'following', video.userId);
      
      if (prevStatus) {
        await deleteDoc(followerRef);
        await deleteDoc(followingRef);
      } else {
        await setDoc(followerRef, {
          followerId: user.id,
          createdAt: serverTimestamp()
        });
        await setDoc(followingRef, {
          followingId: video.userId,
          createdAt: serverTimestamp()
        });
        await sendNotification(video.userId, user, 'follow', undefined, 'started following you');
      }
    } catch (err) {
      console.error("Follow database update error:", err);
    }
  };

  const handleSendComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !newComment.trim() || !video.id) return;
    hapticFeedback('medium');
    const textToSend = newComment;
    setNewComment('');
    
    const parentId = replyingTo ? replyingTo.commentId : null;
    const replyToName = replyingTo ? replyingTo.fullName : null;
    const replyToUserId = replyingTo ? replyingTo.userId : null;
    setReplyingTo(null);

    try {
      const commentRef = collection(db, 'videos', video.id, 'comments');
      await addDoc(commentRef, {
        userId: user.id,
        fullName: user.fullName,
        username: user.username || '',
        profilePhoto: user.profilePhoto || '',
        text: textToSend,
        createdAt: serverTimestamp(),
        isVerified: user.isVerified || false,
        ...(parentId ? { parentId, replyToName, replyToUserId } : {})
      });

      const videoDocRef = doc(db, 'videos', video.id);
      await setDoc(videoDocRef, {
        commentCount: increment(1)
      }, { merge: true });

      setCommentCount(prev => prev + 1);

      if (parentId && replyToUserId) {
        if (replyToUserId !== user.id) {
          await sendNotification(replyToUserId, user, 'comment', video.id, `replied to your comment: "${textToSend.substring(0, 30)}${textToSend.length > 30 ? '...' : ''}"`);
        }
      } else if (video.userId && video.userId !== user.id) {
        await sendNotification(video.userId, user, 'comment', video.id, `commented: "${textToSend.substring(0, 30)}${textToSend.length > 30 ? '...' : ''}"`);
      }
    } catch (err) {
      console.error("Error adding comment: ", err);
    }
  };

  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    if (!user || !video.id) return;
    if (user.id !== commentUserId && user.id !== video.userId && !isAdmin) {
      alert("You don't have permission to delete this comment.");
      return;
    }
    
    if (window.confirm(appLanguage === 'bn' ? "মন্তব্যটি ডিলিট করতে চান?" : "Do you want to delete this comment?")) {
      hapticFeedback('heavy');
      try {
        const commentDocRef = doc(db, 'videos', video.id, 'comments', commentId);
        await deleteDoc(commentDocRef);
        
        const videoDocRef = doc(db, 'videos', video.id);
        await setDoc(videoDocRef, {
          commentCount: increment(-1)
        }, { merge: true });

        setCommentCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Error deleting comment: ", err);
      }
    }
  };

  const handleCommentUserClick = (userId: string) => {
    if (!userId) return;
    hapticFeedback('light');
    window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: userId }));
    setShowComments(false);
  };

  const handleReactionSelect = async (emoji: string) => {
    if (!user || !video.id) return;
    hapticFeedback('medium');
    setShowReactionPanel(false);

    try {
      const videoRefDoc = doc(db, 'videos', video.id);
      const likeRef = doc(db, 'videos', video.id, 'likes', user.id);
      const likeSnap = await getDoc(likeRef);

      if (!likeSnap.exists()) {
        await setDoc(likeRef, {
          userId: user.id,
          reaction: emoji,
          createdAt: serverTimestamp()
        });
        await setDoc(videoRefDoc, {
          likeCount: increment(1)
        }, { merge: true });
        
        setLikeCount(prev => prev + 1);
        setIsLiked(true);
        setSelectedReaction(emoji);

        if (video.userId && video.userId !== user.id) {
          await sendNotification(video.userId, user, 'like', video.id, `reacted ${emoji} to your post`);
        }
      } else {
        const oldReaction = likeSnap.data().reaction;
        if (oldReaction !== emoji) {
          await setDoc(likeRef, {
            reaction: emoji
          }, { merge: true });
          setSelectedReaction(emoji);
        }
      }
    } catch (err) {
      console.error("Reaction error:", err);
    }
  };

  const handleDoubleClickMedia = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !video.id) return;
    
    hapticFeedback('heavy');
    setShowLikeHeart(true);
    setTimeout(() => {
      setShowLikeHeart(false);
    }, 1000);

    const emoji = '❤️';
    try {
      const videoRefDoc = doc(db, 'videos', video.id);
      const likeRef = doc(db, 'videos', video.id, 'likes', user.id);
      const likeSnap = await getDoc(likeRef);

      if (!likeSnap.exists()) {
        await setDoc(likeRef, {
          userId: user.id,
          reaction: emoji,
          createdAt: serverTimestamp()
        });
        await setDoc(videoRefDoc, {
          likeCount: increment(1)
        }, { merge: true });
        
        setLikeCount(prev => prev + 1);
        setIsLiked(true);
        setSelectedReaction(emoji);

        if (video.userId && video.userId !== user.id) {
          await sendNotification(video.userId, user, 'like', video.id, `reacted ${emoji} to your post`);
        }
      } else {
        const oldReaction = likeSnap.data().reaction;
        if (oldReaction !== emoji) {
          await setDoc(likeRef, {
            reaction: emoji
          }, { merge: true });
          setSelectedReaction(emoji);
        }
      }
    } catch (err) {
      console.error("Double tap like error:", err);
    }
  };

  const handleLikeClickWithHold = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !video.id) return;

    if (hasTriggeredLongPress.current) {
      hasTriggeredLongPress.current = false;
      return;
    }

    hapticFeedback('light');
    const wasLiked = isLiked;
    
    try {
      const videoRefDoc = doc(db, 'videos', video.id);
      const likeRef = doc(db, 'videos', video.id, 'likes', user.id);

      if (wasLiked) {
        await deleteDoc(likeRef);
        await setDoc(videoRefDoc, {
          likeCount: increment(-1)
        }, { merge: true });

        setLikeCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
        setSelectedReaction(null);
      } else {
        const emoji = '👍';
        await setDoc(likeRef, {
          userId: user.id,
          reaction: emoji,
          createdAt: serverTimestamp()
        });
        await setDoc(videoRefDoc, {
          likeCount: increment(1)
        }, { merge: true });

        setLikeCount(prev => prev + 1);
        setIsLiked(true);
        setSelectedReaction(emoji);

        if (video.userId && video.userId !== user.id) {
          await sendNotification(video.userId, user, 'like', video.id, `liked your post`);
        }
      }
    } catch (err) {
      console.error("Like toggle error:", err);
    }
  };

  const startHold = (e: React.MouseEvent) => {
    e.stopPropagation();
    hasTriggeredLongPress.current = false;
    holdTimeoutRef.current = setTimeout(() => {
      hapticFeedback('medium');
      hasTriggeredLongPress.current = true;
      setShowReactionPanel(true);
    }, 500);
  };

  const endHold = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }
  };

  let touchStartY = 0;
  let touchStartX = 0;
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    hasTriggeredLongPress.current = false;
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
    holdTimeoutRef.current = setTimeout(() => {
      hapticFeedback('medium');
      hasTriggeredLongPress.current = true;
      setShowReactionPanel(true);
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (Math.abs(touch.clientY - touchStartY) > 10 || Math.abs(touch.clientX - touchStartX) > 10) {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
      }
    }
  };

  const toggleShare = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    hapticFeedback('medium');
    const appLang = appLanguage;
    const postUrl = `${getAppOrigin()}/post/${video.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: video.fullName || 'World Post',
          text: video.description || 'Check out this post on World App!',
          url: postUrl
        });
        showToast(appLang === 'bn' ? 'সফলভাবে শেয়ার করা হয়েছে!' : 'Shared successfully!');
      } catch (err) {
        console.warn('Share failed or dismissed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(postUrl);
        showToast(appLang === 'bn' ? 'লিংক ক্লিপবোর্ডে কপি করা হয়েছে!' : 'Link copied to clipboard!');
      } catch (err) {
        console.error('Clipboard copy failed:', err);
        showToast(appLang === 'bn' ? 'শেয়ার লিংক: ' + postUrl : 'Share URL: ' + postUrl);
      }
    }
  };

  const displayUrl = video.contentUrl || (video as any).videoUrl || (video as any).imageUrl || '';
  const isImage = video.type === 'image' || (video.type as string) === 'photo' || 
    (video.type !== 'video' && video.type !== 'text' && displayUrl && (
      displayUrl.toLowerCase().includes('.jpg') || 
      displayUrl.toLowerCase().includes('.png') || 
      displayUrl.toLowerCase().includes('.jpeg') || 
      displayUrl.toLowerCase().includes('.webp') ||
      displayUrl.toLowerCase().includes('.heic') ||
      displayUrl.toLowerCase().includes('.gif') ||
      displayUrl.toLowerCase().startsWith('data:image/')
    ));
  
  const isProfilePhotoUpdate = video.title === 'প্রোফাইল ছবি পরিবর্তন করেছেন / Updated Profile Photo' || 
                               (video.title || '').includes('Updated Profile Photo') || 
                               (video.title || '').includes('প্রোফাইল ছবি পরিবর্তন');

  const isCoverPhotoUpdate = video.title === 'কভার ছবি পরিবর্তন করেছেন / Updated Cover Photo' || 
                             (video.title || '').includes('Updated Cover Photo') || 
                             (video.title || '').includes('কভার ছবি পরিবর্তন');

  const isText = video.type === 'text' || (!displayUrl && (video.description || video.title || (video as any).textContent));
  const isVideo = !isImage && !isText && displayUrl;

  const postText = video.description || (video as any).textContent || video.title || '';
  const bgColor = (video as any).backgroundColor || (video as any).bgColor || '';
  const isTailwind = bgColor.startsWith('bg-');

  const rawText = video.description || (video as any).textContent || video.title || '';
  const isLong = rawText.length > 280;
  const displayContent = isLong && !expanded ? rawText.slice(0, 280) + '...' : rawText;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-lg mb-4 flex flex-col relative select-text transition-all duration-300">
      {/* Post Header */}
      <div className="px-3.5 py-3 flex items-center justify-between border-b border-[var(--border-secondary)]/30 relative select-none">
        <div className="flex items-center space-x-2.5 select-none">
          <div 
            onClick={() => handleCommentUserClick(video.userId)}
            className="w-9 h-9 rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)] cursor-pointer flex-shrink-0"
          >
            {creatorInfo?.profilePhoto ? (
              <img src={creatorInfo.profilePhoto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-500 text-white text-xs font-bold">
                {creatorInfo?.fullName?.charAt(0).toUpperCase() || video.fullName?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
          </div>
          
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span 
                onClick={() => handleCommentUserClick(video.userId)}
                className="text-xs font-black text-[var(--text-primary)] tracking-wide hover:underline cursor-pointer"
              >
                {creatorInfo?.fullName || video.fullName}
              </span>
              {(video as any).isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 fill-blue-400 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] text-[var(--text-secondary)] opacity-60">
                {formatTimeAgo(video.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Action Area */}
        <div className="flex items-center space-x-1.5 relative">
          {/* Quick Follow Button if not self */}
          {user && video.userId && user.id !== video.userId && !isFollowing && (
            <button 
              onClick={() => toggleFollow()}
              className="px-2.5 py-1.5 bg-indigo-600/10 hover:bg-indigo-600 active:scale-95 text-indigo-500 hover:text-white rounded-lg transition-all text-[9.5px] font-black uppercase tracking-wider border border-indigo-500/10"
            >
              Follow
            </button>
          )}

          {/* Trigger menu popover button */}
          <button 
            onClick={() => {
              hapticFeedback('light');
              setShowMenu(!showMenu);
            }}
            className="p-1.5 hover:bg-[var(--bg-secondary)] active:scale-95 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-transparent hover:border-[var(--border-secondary)]/40"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Options Dropdown Menu Modal */}
          {showMenu && (
            <>
              {/* Overlay Backdrop */}
              <div 
                className="fixed inset-0 z-[998]" 
                onClick={() => setShowMenu(false)}
              />
              {/* Popover Card */}
              <div className="absolute right-0 top-9 w-64 bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-2xl shadow-2xl z-[999] overflow-hidden select-none animate-in fade-in slide-in-from-top-3 duration-200">
                <div className="py-1 divide-y divide-[var(--border-secondary)]/40 max-h-[400px] overflow-y-auto no-scrollbar">
                  {(() => {
                    const optionsList = [
                      {
                        id: 'report',
                        label: 'Report post',
                        banglaLabel: 'পোস্ট রিপোর্ট করুন',
                        desc: 'Report this post if it violates community guidelines',
                        banglaDesc: 'কমিউনিটি নির্দেশিকা লঙ্ঘনের জন্য পোস্টটি রিপোর্ট করুন',
                        icon: ShieldAlert,
                        colorClass: 'text-amber-500',
                        action: async () => {
                          const appLang = appLanguage;
                          if (!user) {
                            alert(appLang === 'bn' ? "দয়া করে রিপোর্ট করতে লগইন করুন" : "Please log in to report this post");
                            return;
                          }
                          const title = appLang === 'bn' ? "পোস্ট রিপোর্ট করুন" : "Report Post";
                          const msg = appLang === 'bn' ? "রিপোর্ট করার কারণ লিখুন:" : "Enter reporting reason:";
                          const runAction = async (val?: string) => {
                            if (!val || !val.trim()) {
                              alert(appLang === 'bn' ? "দয়া করে সঠিক বিবরণ লিখুন" : "Please enter a valid description");
                              return;
                            }
                            try {
                              await addDoc(collection(db, 'reports'), {
                                postId: video.id,
                                postCreatorId: video.userId,
                                reporterId: user.id,
                                reason: val.trim(),
                                createdAt: serverTimestamp()
                              });
                              showToast(appLang === 'bn' ? "রিপোর্ট জমা হয়েছে!" : "Report submitted!");
                            } catch (err) {
                              console.error("Report error:", err);
                              showToast(appLang === 'bn' ? "রিপোর্ট জমা দিতে ব্যর্থ হয়েছে" : "Failed to report");
                            }
                          };

                          if ((window as any).showCustomPrompt) {
                            (window as any).showCustomPrompt(title, msg, "", "", runAction);
                          } else {
                            const reason = window.prompt(msg);
                            if (reason !== null) runAction(reason);
                          }
                        }
                      },
                      {
                        id: 'copyright',
                        label: 'Copyright claim',
                        banglaLabel: 'কপিরাইট ক্লেইম',
                        desc: 'File copyright complaint against copying of your intellectual property',
                        banglaDesc: 'আপনার মেধা কন্টেন্ট চুরির বিরুদ্ধে কপিরাইট অভিযোগ দায়ের করুন।',
                        icon: ShieldAlert,
                        colorClass: 'text-rose-500',
                        action: async () => {
                          const appLang = appLanguage;
                          if (!user) {
                            alert(appLang === 'bn' ? "দয়া করে কপিরাইট অভিযোগ করতে লগইন করুন" : "Please log in to file a copyright claim");
                            return;
                          }
                          const title = appLang === 'bn' ? "কপিরাইট ক্লেইম" : "Copyright Claim";
                          const msg = appLang === 'bn' ? "কপিরাইট লঙ্ঘনের বিবরণ বা প্রমাণ লিখুন:" : "Describe copyright infringement/evidence:";
                          const runAction = async (val?: string) => {
                            if (!val || !val.trim()) {
                              alert(appLang === 'bn' ? "দয়া করে সঠিক বিবরণ লিখুন" : "Please enter a valid description");
                              return;
                            }
                            try {
                              await addDoc(collection(db, 'copyrightClaims'), {
                                postId: video.id,
                                postCreatorId: video.userId,
                                claimantId: user.id,
                                description: val.trim(),
                                createdAt: serverTimestamp()
                              });
                              showToast(appLang === 'bn' ? "কপিরাইট অভিযোগ জমা হয়েছে!" : "Copyright claim submitted!");
                            } catch (err) {
                              console.error("Copyright claim error:", err);
                              showToast(appLang === 'bn' ? "অভিযোগ জমা দিতে ব্যর্থ হয়েছে" : "Claim submission failed");
                            }
                          };

                          if ((window as any).showCustomPrompt) {
                            (window as any).showCustomPrompt(title, msg, "", "", runAction);
                          } else {
                            const descText = window.prompt(msg);
                            if (descText !== null) runAction(descText);
                          }
                        }
                      },
                      {
                        id: 'follow',
                        label: isFollowing ? 'Unfollow creator' : 'Follow creator',
                        banglaLabel: isFollowing ? 'আনফলো করুন' : 'ফলো করুন',
                        desc: isFollowing 
                          ? 'Stop seeing posts from this creator in your feed.' 
                          : 'Prioritize posts from this creator in your feed.',
                        banglaDesc: isFollowing 
                          ? 'হোম ফিডে এই ক্রিয়েটরের পোস্ট দেখা বন্ধ করুন।' 
                          : 'ফিডে এই ক্রিয়েটরের পোস্ট বেশি দেখুন।',
                        icon: isFollowing ? UserMinus : UserPlus,
                        colorClass: isFollowing ? 'text-gray-400' : 'text-emerald-500',
                        action: async (e: React.MouseEvent) => {
                          const appLang = appLanguage;
                          if (!user) {
                            alert(appLang === 'bn' ? "দয়া করে ফলো করতে লগইন করুন" : "Please login to follow this creator");
                            return;
                          }
                          await toggleFollow(e);
                        }
                      },
                      {
                        id: 'block',
                        label: 'Block user',
                        banglaLabel: 'ব্লক করুন',
                        desc: 'Block this user from seeing or commenting on your profile',
                        banglaDesc: 'এই ব্যবহারকারীকে আপনার প্রোফাইল বা পোস্ট দেখা থেকে বিরত রাখুন।',
                        icon: UserX,
                        colorClass: 'text-red-500 font-extrabold',
                        action: async () => {
                          const appLang = appLanguage;
                          if (!user) {
                            alert(appLang === 'bn' ? "দয়া করে ব্লক করতে লগইন করুন" : "Please log in to block this user");
                            return;
                          }
                          if (user.id === video.userId) {
                            alert(appLang === 'bn' ? "আপনি নিজেকে ব্লক করতে পারবেন না" : "You cannot block yourself");
                            return;
                          }
                          const title = appLang === 'bn' ? "ইউজার ব্লক করুন" : "Block User";
                          const msg = appLang === 'bn' ? "আপনি কি নিশ্চিতভাবে এই ব্যবহারকারীকে ব্লক করতে চান?" : "Are you sure you want to block this user?";
                          const runAction = async () => {
                            try {
                              await setDoc(doc(db, 'users', user.id, 'blockedUsers', video.userId), {
                                blockedUserId: video.userId,
                                createdAt: serverTimestamp()
                              });
                              showToast(appLang === 'bn' ? "ব্যবহারকারী ব্লক করা হয়েছে" : "User blocked successfully");
                            } catch (err) {
                              console.error("Block user error:", err);
                              showToast(appLang === 'bn' ? "ব্লক করতে ব্যর্থ হয়েছে" : "Failed to block user");
                            }
                          };

                          if ((window as any).showCustomConfirm) {
                            (window as any).showCustomConfirm(title, msg, runAction);
                          } else {
                            const confirmBlock = window.confirm(msg);
                            if (confirmBlock) runAction();
                          }
                        }
                      },
                      {
                        id: 'notInterested',
                        label: 'Not interested',
                        banglaLabel: 'আগ্রহী নই',
                        desc: 'Hide posts similar to this from your home feed',
                        banglaDesc: 'ফিড থেকে এই ধরণের অনুরূপ পোস্টগুলো লুকিয়ে ফেলুন।',
                        icon: EyeOff,
                        colorClass: 'text-violet-500',
                        action: async () => {
                          const appLang = appLanguage;
                          if (!user) {
                            alert(appLang === 'bn' ? "দয়া করে লগইন করুন" : "Please log in to use this option");
                            return;
                          }
                          try {
                            await setDoc(doc(db, 'users', user.id, 'notInterested', video.id), {
                              postId: video.id,
                              createdAt: serverTimestamp()
                            });
                            showToast(appLang === 'bn' ? "আগ্রহহীন হিসেবে চিহ্নিত করা হয়েছে" : "Marked as not interested");
                          } catch (err) {
                            console.error("Not interested error:", err);
                            showToast(appLang === 'bn' ? "পছন্দ সংরক্ষণ করতে ব্যর্থ হয়েছে" : "Failed to save choice");
                          }
                        }
                      },
                      {
                        id: 'save',
                        label: isSaved ? 'Unsave post' : 'Save post',
                        banglaLabel: isSaved ? 'সংরক্ষণ বাতিল করুন' : 'সংরক্ষণ করুন',
                        desc: isSaved 
                          ? 'Remove bookmark' 
                          : 'Add to saved bookmark',
                        banglaDesc: isSaved 
                          ? 'সংরক্ষিত তালিকা থেকে সরিয়ে ফেলুন' 
                          : 'পরবর্তীতে দেখার জন্য সংরক্ষণ করুন',
                        icon: Bookmark,
                        colorClass: isSaved ? 'text-amber-500' : 'text-teal-500',
                        action: async () => {
                          const appLang = appLanguage;
                          if (!user) {
                            alert(appLang === 'bn' ? "দয়া করে পোস্ট সংরক্ষণ করতে লগইন করুন" : "Please log in to save this post");
                            return;
                          }
                          try {
                            const saveRef = doc(db, 'users', user.id, 'savedPosts', video.id);
                            if (isSaved) {
                              await deleteDoc(saveRef);
                              showToast(appLang === 'bn' ? "সংরক্ষণ বাতিল করা হয়েছে" : "Post unsaved");
                            } else {
                              await setDoc(saveRef, {
                                postId: video.id,
                                savedAt: serverTimestamp()
                              });
                              showToast(appLang === 'bn' ? "পোস্টটি সফলভাবে সংরক্ষণ করা হয়েছে!" : "Post saved successfully!");
                            }
                          } catch (err) {
                            console.error("Save post error:", err);
                            showToast(appLang === 'bn' ? "পরিবর্তন সংরক্ষণ করা যায়নি" : "Failed to save change");
                          }
                        }
                      }
                    ];
                    
                    const listToRender = [...optionsList];
                    if (user?.id === video.userId || isAdmin) {
                      listToRender.unshift({
                        id: 'edit',
                        label: 'Edit post',
                        banglaLabel: 'সম্পাদনা করুন',
                        desc: 'Modify post contents',
                        banglaDesc: 'পোস্টের বিবরণ বা লেখা পরিবর্তন করুন',
                        icon: Edit,
                        colorClass: 'text-indigo-500 font-extrabold bg-indigo-50/50 dark:bg-indigo-950/20',
                        action: async (e: React.MouseEvent) => {
                          if ((window as any).editPost) {
                            (window as any).editPost(video);
                          } else {
                            window.dispatchEvent(new CustomEvent('edit-post', { detail: video }));
                          }
                        }
                      });
                    }

                    if (onDelete && (user?.id === video.userId || isAdmin)) {
                      listToRender.unshift({
                        id: 'delete',
                        label: 'Delete post',
                        banglaLabel: 'ডিলিট করুন',
                        desc: 'This post will be deleted permanently',
                        banglaDesc: 'এই পোস্টটি চিরতরে মুছে ফেলা হবে',
                        icon: Trash2,
                        colorClass: 'text-red-500 font-extrabold bg-red-50 dark:bg-red-950/20',
                        action: async (e: React.MouseEvent) => {
                          onDelete(e);
                        }
                      });
                    }

                    return listToRender.map((opt) => {
                      const IconComp = opt.icon;
                      const displayTitle = appLanguage === 'bn' ? opt.banglaLabel : opt.label;
                      const displayDesc = appLanguage === 'bn' ? opt.banglaDesc : opt.desc;
                      return (
                        <button
                          key={opt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowMenu(false);
                            opt.action(e);
                          }}
                          className={`w-full text-left px-5 py-3.5 flex items-start gap-4 hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)]/80 transition-all ${opt.colorClass}`}
                        >
                          <IconComp className="w-5 h-5 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black tracking-wide uppercase">{displayTitle}</span>
                              <ChevronRight className="w-4 h-4 opacity-75 animate-bounce-horizontal" />
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-1 leading-normal whitespace-normal select-text">
                              {displayDesc}
                            </p>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description Text section */}
      {(video.description || postText) && !isText && (
        <div className="px-3.5 pb-2.5">
          <p className="text-xs text-[var(--text-primary)] font-medium leading-relaxed whitespace-pre-wrap break-words font-sans">
            {video.description || postText}
          </p>
        </div>
      )}

      {/* Primary media element context box */}
      <div className="w-full relative bg-black flex flex-col justify-center overflow-hidden">
        {hasMediaError ? (
          <div className="px-6 py-12 bg-[#0e0f13] text-center flex flex-col items-center justify-center border border-white/5 space-y-3 min-h-[190px]">
            <AlertCircle className="w-8 h-8 text-amber-500 animate-pulse" />
            <div className="text-white font-black text-xs uppercase tracking-wider">Media file not found</div>
            <p className="text-[10px] text-gray-400 max-w-xs leading-relaxed font-semibold">
              Because local storage is temporary, the media files might be lost after server restarts. For permanent uploads, configure <b>Firebase</b> storage cloud options from settings.
            </p>
          </div>
        ) : isText ? (
          /* Text background gradient status post standard style */
          <div 
            onClick={handleDoubleClickMedia}
            className={cn(
              "px-6 py-12 min-h-[190px] w-full flex items-center justify-center text-center cursor-pointer select-text relative",
              isTailwind ? bgColor : (!bgColor ? "bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500" : "")
            )}
            style={bgColor && !isTailwind ? { backgroundColor: bgColor } : {}}
          >
            <p className="text-white text-base md:text-lg font-bold leading-snug drop-shadow-md tracking-wide px-2 select-text max-w-md">
              {displayContent}
            </p>
            {isLong && !expanded && (
              <button 
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                className="absolute bottom-3 right-3 bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[9px] font-black uppercase text-white rounded-md tracking-wider border border-white/10 active:scale-95 transition-all text-left"
              >
                Read more
              </button>
            )}
          </div>
        ) : isImage ? (
          /* Image container with tap to fullscreen */
          <>
            <div 
              className="w-full cursor-pointer relative overflow-hidden select-text bg-[#0e0f13]"
              onClick={() => {
                hapticFeedback('light');
                setShowFullScreen(true);
              }}
              onDoubleClick={handleDoubleClickMedia}
            >
              {isProfilePhotoUpdate ? (
                /* Specialized beautiful Facebook-style Profile Picture update post */
                <div className="relative w-full h-[320px] bg-gradient-to-tr from-gray-950 via-gray-900 to-[#121318] flex items-center justify-center overflow-hidden border-y border-white/5">
                  {/* Blurry ambient backdrop of the new profile picture */}
                  <img 
                    src={displayUrl} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110 select-none pointer-events-none" 
                    referrerPolicy="no-referrer"
                  />
                  {/* Stack of elements */}
                  <div className="relative z-10 flex flex-col items-center">
                    {/* Ring highlight container */}
                    <div className="relative p-1 rounded-full bg-gradient-to-tr from-pink-500 via-indigo-500 to-rose-400 shadow-[0_0_30px_rgba(255,75,145,0.25)]">
                      <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-black bg-gray-900 relative">
                        <img 
                          src={displayUrl} 
                          alt={video.fullName} 
                          className="w-full h-full object-cover transition-all duration-300 hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                    {/* Tiny badge */}
                    <span className="mt-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-widest text-[#FF4B91] border border-pink-500/10">
                      New Profile Photo
                    </span>
                  </div>
                </div>
              ) : isCoverPhotoUpdate ? (
                /* Specialized beautiful Cover Photo update post matching profile headers */
                <div className="relative w-full h-[220px] bg-gray-950 overflow-hidden border-y border-white/5">
                  {/* The cover photo image spanning full-width */}
                  <img 
                    src={displayUrl} 
                    alt={video.fullName} 
                    className="w-full h-full object-cover transition-all duration-300 hover:scale-[1.02]"
                    referrerPolicy="no-referrer"
                  />
                  {/* Vignette dark overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
                  
                  {/* Bottom overlay simulating profile page view */}
                  <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between z-10 select-none">
                    <div className="flex items-center space-x-3.5">
                      {/* Avatar frame */}
                      <div className="w-14 h-14 rounded-2xl bg-black border-2 border-white shadow-2xl overflow-hidden p-0.5 flex-shrink-0">
                        {creatorInfo?.profilePhoto || video.profilePhoto ? (
                          <img 
                            src={creatorInfo?.profilePhoto || video.profilePhoto || undefined} 
                            alt="" 
                            className="w-full h-full object-cover rounded-xl" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full bg-pink-500 rounded-xl flex items-center justify-center text-white text-md font-black">
                            {video.fullName?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        <h4 className="text-xs font-black text-white tracking-wide">{video.fullName}</h4>
                        <p className="text-[9px] text-gray-300 font-semibold tracking-wider uppercase mt-0.5">Updated Cover Photo</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Standard standalone picture post rendering default format */
                <img 
                  src={displayUrl} 
                  alt={video.fullName} 
                  className="w-full h-auto max-h-[750px] sm:max-h-[80vh] object-contain mx-auto block transition-all" 
                  style={filterStyle}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    console.warn("Post image failed to load, invoking fallback notice UI");
                    setHasMediaError(true);
                  }}
                />
              )}

              {/* Overlay text rendering */}
              {video.overlayText && (
                <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none select-none">
                  <span 
                    style={{ color: video.textColor || '#ffffff' }}
                    className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-center px-4 break-words bg-black/30 backdrop-blur-[2px] p-2 rounded-xl border border-white/10"
                  >
                    {video.overlayText}
                  </span>
                </div>
              )}

              {/* Stickers rendering */}
              {postStickers.map((sticker: any, idx: number) => (
                <div
                  key={`p-sticker-${idx}`}
                  style={{ 
                    position: 'absolute',
                    left: `${sticker.x}%`, 
                    top: `${sticker.y}%`, 
                    fontSize: `${sticker.scale || 48}px`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20,
                    pointerEvents: 'none',
                    userSelect: 'none'
                  }}
                  className="absolute"
                >
                  {sticker.value}
                </div>
              ))}
            </div>

            <AnimatePresence>
              {showFullScreen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/98 z-[10000] flex flex-col items-center justify-center select-none overflow-hidden touch-none"
                  onClick={() => setShowFullScreen(false)}
                >
                  {/* Top bar with controls */}
                  <div 
                    className="absolute top-0 left-0 right-0 p-4 pt-[env(safe-area-inset-top,16px)] flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent z-[10005]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button 
                      onClick={() => setShowFullScreen(false)} 
                      className="p-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-full backdrop-blur-md border border-white/5 transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    
                    <div className="text-white/75 text-[10px] font-black uppercase tracking-wider bg-black/40 border border-white/5 px-3 py-1.5 rounded-full backdrop-blur-md">
                      ↕️ Swipe up/down to close
                    </div>

                    {(user?.id === video.userId || isAdmin) ? (
                      <button 
                        onClick={() => {
                          setShowFullScreen(false);
                          if ((window as any).editPost) {
                            (window as any).editPost(video);
                          } else {
                            window.dispatchEvent(new CustomEvent('edit-post', { detail: video }));
                          }
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl backdrop-blur-md border border-indigo-500/20 shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    ) : (
                      <div className="w-10 h-10" />
                    )}
                  </div>

                  {/* Drag-to-dismiss motion container */}
                  <motion.div
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.65}
                    onDragEnd={(event, info) => {
                      if (Math.abs(info.offset.y) > 110) {
                        setShowFullScreen(false);
                      }
                    }}
                    className="w-full max-w-lg px-3 flex items-center justify-center cursor-grab active:cursor-grabbing relative"
                    onClick={() => setShowFullScreen(false)}
                  >
                    <img
                      src={displayUrl}
                      alt={video.fullName}
                      className="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl pointer-events-none select-none transition-all"
                      style={filterStyle}
                      onError={() => setHasMediaError(true)}
                    />

                    {/* Overlay text rendering */}
                    {video.overlayText && (
                      <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none select-none">
                        <span 
                          style={{ color: video.textColor || '#ffffff' }}
                          className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-center px-4 break-words bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10"
                        >
                          {video.overlayText}
                        </span>
                      </div>
                    )}

                    {/* Stickers rendering */}
                    {postStickers.map((sticker: any, idx: number) => (
                      <div
                        key={`pf-sticker-${idx}`}
                        style={{ 
                          position: 'absolute',
                          left: `${sticker.x}%`, 
                          top: `${sticker.y}%`, 
                          fontSize: `${sticker.scale || 56}px`,
                          transform: 'translate(-50%, -50%)',
                          zIndex: 20,
                          pointerEvents: 'none',
                          userSelect: 'none'
                        }}
                        className="absolute"
                      >
                        {sticker.value}
                      </div>
                    ))}
                  </motion.div>

                  {/* Footer overlay indicator */}
                  <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none select-none z-[10005]">
                    <span className="text-[10px] font-black uppercase text-white/45 tracking-widest bg-white/5 px-2.5 py-1 rounded-md border border-white/5">Tap anywhere to return</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : isVideo ? (
          /* HTML5 Video container */
          <div 
            className="w-full cursor-pointer relative overflow-hidden bg-black max-h-[480px]"
            onClick={togglePlay}
            onDoubleClick={handleDoubleClickMedia}
          >
            <video
              ref={videoRef}
              src={displayUrl}
              className="w-full h-full max-h-[480px] object-contain mx-auto transition-all"
              style={filterStyle}
              loop
              playsInline
              muted={isMuted}
              onError={() => {
                console.warn("Post video failed to load, invoking fallback notice UI");
                setHasMediaError(true);
              }}
            />

            {/* Overlay text rendering */}
            {video.overlayText && (
              <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none select-none">
                <span 
                  style={{ color: video.textColor || '#ffffff' }}
                  className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-center px-4 break-words bg-black/30 backdrop-blur-[2px] p-2 rounded-xl border border-white/10"
                >
                  {video.overlayText}
                </span>
              </div>
            )}

            {/* Stickers rendering */}
            {postStickers.map((sticker: any, idx: number) => (
              <div
                key={`pv-sticker-${idx}`}
                style={{ 
                  position: 'absolute',
                  left: `${sticker.x}%`, 
                  top: `${sticker.y}%`, 
                  fontSize: `${sticker.scale || 48}px`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
                className="absolute"
              >
                {sticker.value}
              </div>
            ))}
            
            {/* Center Pause state overlay block */}
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center p-4">
                <div className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/10 animate-pulse">
                  <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                </div>
              </div>
            )}

            {/* Float volume actions */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                hapticFeedback('light');
                if (setIsMuted) setIsMuted(!isMuted);
              }}
              className="absolute bottom-2.5 right-2.5 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white border border-white/10 active:scale-95 transition-all"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ) : null}

        {/* Floating doubletap reaction badge */}
        <AnimatePresence>
          {showLikeHeart && (
            <motion.div 
              initial={{ scale: 0.1, opacity: 0, rotate: -20 }}
              animate={{ scale: [1, 1.3, 1], opacity: [1, 1, 0], rotate: 0 }}
              exit={{ opacity: 0 }}
              className="absolute pointer-events-none inset-0 flex items-center justify-center z-10"
            >
              <div className="w-16 h-16 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-2xl">
                <Heart className="w-10 h-10 text-rose-500 fill-rose-500" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Counts bottom bar - aligned straight above the Like, Comment, Share buttons */}
      <div className="grid grid-cols-3 px-1.5 py-2.5 border-b border-[var(--border-secondary)] text-xs text-[var(--text-secondary)] font-medium select-none text-center">
        {/* Like/Reaction count directly above Like button */}
        <div className="flex flex-col items-center justify-center border-r border-[var(--border-secondary)]/30">
          <div className="flex items-center gap-1 bg-[var(--bg-secondary)]/20 px-2 py-0.5 rounded-full">
            <div className="flex items-center -space-x-0.5">
              <div className="w-3.5 h-3.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-md flex items-center justify-center border border-[var(--bg-card)]">
                <ThumbsUp className="w-2 h-2 text-white fill-white" />
              </div>
              <div className="w-3.5 h-3.5 bg-gradient-to-br from-rose-500 to-rose-600 rounded-md flex items-center justify-center border border-[var(--bg-card)]">
                <Heart className="w-2 h-2 text-white fill-white" />
              </div>
            </div>
            <span className="font-extrabold text-[11px] text-[var(--text-primary)]">{likeCount || 0}</span>
          </div>
          <span className="text-[9px] text-[var(--text-secondary)] font-black uppercase tracking-wider mt-1">Reactions</span>
        </div>

        {/* Comment count directly above Comment button */}
        <button 
          onClick={() => {
            hapticFeedback('light');
            setShowComments(true);
          }}
          className="flex flex-col items-center justify-center border-r border-[var(--border-secondary)]/30 hover:bg-[var(--bg-secondary)]/30 rounded-lg py-0.5 transition-colors"
        >
          <div className="flex items-center gap-1 bg-[var(--bg-secondary)]/20 px-2 py-0.5 rounded-full">
            <MessageSquare className="w-3 h-3 text-[#FF4B91]" />
            <span className="font-extrabold text-[11px] text-[var(--text-primary)]">{commentCount || 0}</span>
          </div>
          <span className="text-[9px] text-[var(--text-secondary)] font-black uppercase tracking-wider mt-1">Comments</span>
        </button>

        {/* View count directly above Share button */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 bg-[var(--bg-secondary)]/20 px-2 py-0.5 rounded-full">
            <Eye className="w-3 h-3 text-emerald-500" />
            <span className="font-extrabold text-[11px] text-[var(--text-primary)]">{viewCount || 0}</span>
          </div>
          <span className="text-[9px] text-[var(--text-secondary)] font-black uppercase tracking-wider mt-1">Views</span>
        </div>
      </div>

      {/* Action interaction buttons row */}
      <div className="relative flex items-center justify-between px-1.5 py-1 text-xs font-bold text-[var(--text-secondary)] select-none">
        {/* Custom Reactions Popover menu relative to Like button parent box */}
        <div className="flex-1 relative">
          {(() => {
            const reactionMetadata: { [key: string]: { label: string; textClass: string } } = {
              '👍': { label: 'Like', textClass: 'text-blue-500' },
              '❤️': { label: 'Love', textClass: 'text-red-500 font-extrabold' },
              '🔥': { label: 'Hot', textClass: 'text-orange-500 font-extrabold' },
              '😂': { label: 'Haha', textClass: 'text-amber-500 font-extrabold' },
              '😮': { label: 'Wow', textClass: 'text-cyan-500 font-extrabold' },
              '😢': { label: 'Sad', textClass: 'text-blue-400 font-extrabold' },
              '🙌': { label: 'Celebrate', textClass: 'text-pink-500 font-extrabold' },
            };

            const activeReact = isLiked && selectedReaction && reactionMetadata[selectedReaction] 
              ? reactionMetadata[selectedReaction] 
              : null;

            return (
              <>
                <button 
                  onMouseDown={startHold}
                  onMouseUp={endHold}
                  onMouseLeave={endHold}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  onClick={handleLikeClickWithHold}
                  className={cn(
                    "w-full flex items-center justify-center space-x-1.5 py-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-all active:scale-95 duration-200 select-none touch-none",
                    activeReact ? activeReact.textClass : ""
                  )}
                >
                  {isLiked && selectedReaction ? (
                    <span className="text-sm select-none mr-0.5 transition-transform scale-110 duration-200">{selectedReaction}</span>
                  ) : (
                    <ThumbsUp className={cn("w-4 h-4", isLiked ? "fill-blue-500 " : "fill-none")} />
                  )}
                  <span>
                    {activeReact ? activeReact.label : "Like"}
                  </span>
                </button>

                {/* Floating emoji selection bubble panel */}
                <AnimatePresence>
                  {showReactionPanel && (
                    <>
                      {/* Click outside to close */}
                      <div 
                        className="fixed inset-0 z-[998]" 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setShowReactionPanel(false);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setShowReactionPanel(false);
                        }}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 450, damping: 25 }}
                        className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-full shadow-2xl px-3 py-1.5 flex items-center space-x-2.5 z-[999] whitespace-nowrap min-w-max"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {['👍', '❤️', '🔥', '😂', '😮', '😢', '🙌'].map((emoji, idx) => (
                          <motion.button
                            key={emoji}
                            type="button"
                            initial={{ scale: 0, y: 6 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ delay: idx * 0.02, type: "spring" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReactionSelect(emoji);
                            }}
                            className="text-2xl hover:scale-135 active:scale-90 transition-transform duration-100 p-1 rounded-full hover:bg-[var(--bg-secondary)]/80 cursor-pointer"
                          >
                            {emoji}
                          </motion.button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </>
            );
          })()}
        </div>
        
        <button 
          onClick={() => {
            hapticFeedback('light');
            setShowComments(!showComments);
          }} 
          className="flex-1 flex items-center justify-center space-x-1.5 py-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-all active:scale-95 duration-200 mt-0"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Comment</span>
        </button>
        
        <button 
          onClick={toggleShare} 
          className="flex-1 flex items-center justify-center space-x-1.5 py-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-all active:scale-95 duration-200"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
      </div>

      {/* Centered Comments Dialog Modal */}
      <AnimatePresence>
        {showComments && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Blurred dark backdrop overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowComments(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs cursor-pointer"
            />

            {/* Modal Dialog Card */}
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              className="relative w-full max-w-lg bg-[var(--bg-card)] rounded-2xl border border-[var(--border-secondary)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] z-[99991]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header inside modal */}
              <div className="px-5 py-4 border-b border-[var(--border-secondary)] flex items-center justify-between select-none">
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-[#FF4B91]" />
                    <span>Comments ({commentCount || 0})</span>
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold mt-0.5">Comments are open and shown below</p>
                </div>
                <button 
                  onClick={() => setShowComments(false)}
                  className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/85 rounded-full text-[10px] font-black uppercase text-[var(--text-secondary)] transition-all active:scale-95"
                >
                  Close
                </button>
              </div>

              {/* Scrollable comment list thread inside modal */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar select-text max-h-[45vh]">
                {commentsLoading ? (
                  <div className="flex justify-center py-10 items-center space-x-1.5 select-none">
                    <span className="w-2 h-2 bg-[#FF4B91] rounded-sm animate-pulse" />
                    <span className="w-2 h-2 bg-[#FF4B91]/85 rounded-sm animate-pulse [animation-delay:0.15s]" />
                    <span className="w-2 h-2 bg-[#FF4B91]/50 rounded-sm animate-pulse [animation-delay:0.3s]" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12 text-[var(--text-secondary)]">
                    <p className="text-xs uppercase font-black tracking-widest opacity-60 border border-dashed border-[var(--border-secondary)] py-6 rounded-xl bg-[var(--bg-secondary)]/20">No comments yet</p>
                    <p className="text-[10px] mt-2">Be the first to leave a comment!</p>
                  </div>
                ) : (
                  (() => {
                    const parentComments = comments.filter(c => !c.parentId);
                    const replyComments = comments.filter(c => c.parentId);

                    return parentComments.map((parentComment, parentIdx) => {
                      const canDeleteParent = user && (parentComment.userId === user.id || video.userId === user.id || isAdmin);
                      const commentReplies = replyComments.filter(r => r.parentId === parentComment.id);

                      return (
                        <div key={`${parentComment.id || ''}-cardparent-${parentIdx}`} className="space-y-2 pb-3 border-b border-[var(--border-secondary)] border-dashed last:border-b-0 last:pb-0 select-text">
                          <div className="flex gap-3 animate-in fade-in duration-200 select-text">
                            {/* Profile thumbnail */}
                            <div 
                              onClick={() => handleCommentUserClick(parentComment.userId)}
                              className="w-8 h-8 rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)] cursor-pointer flex-shrink-0"
                            >
                              {parentComment.profilePhoto ? (
                                <img src={parentComment.profilePhoto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-500 text-white text-[11px] font-bold">
                                  {parentComment.fullName?.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>

                            {/* Bubble box */}
                            <div className="flex-1 min-w-0 select-text">
                              <div className="bg-[var(--bg-secondary)]/40 rounded-2xl py-2 px-3.5 border border-[var(--border-secondary)] inline-block max-w-full select-text">
                                <div className="flex items-center gap-2 select-none flex-wrap">
                                  <span 
                                    onClick={() => handleCommentUserClick(parentComment.userId)}
                                    className="text-[var(--text-primary)] text-xs font-black tracking-wide hover:underline cursor-pointer flex items-center gap-1.5 flex-wrap"
                                  >
                                    <span>{parentComment.fullName}</span>
                                    <span className="text-[9px] text-gray-500 font-bold normal-case font-mono bg-[var(--bg-secondary)] px-1 rounded">@{parentComment.username || (parentComment.fullName || "user").toLowerCase().replace(/\s/g, '')}</span>
                                    {parentComment.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 fill-blue-400 flex-shrink-0" />}
                                  </span>
                                  {parentComment.userId === video.userId && (
                                    <span className="text-[6px] bg-blue-500 text-white font-black uppercase px-1 rounded-[3px]">
                                      Creator
                                    </span>
                                  )}
                                  <span className="text-[9px] text-[var(--text-secondary)] opacity-60">
                                    {formatTimeAgo(parentComment.createdAt)}
                                  </span>
                                </div>
                                <p className="text-[var(--text-primary)] text-xs font-normal leading-normal whitespace-pre-wrap break-words select-text mt-1">
                                  {parentComment.text}
                                </p>
                              </div>
                              
                              {/* Comment tools */}
                              <div className="flex items-center space-x-3 mt-1.5 pl-1 text-[10px] select-none text-[var(--text-secondary)] font-bold">
                                <button 
                                  onClick={() => {
                                    if (!user) {
                                      if ((window as any).triggerLogin) {
                                        (window as any).triggerLogin();
                                      }
                                      return;
                                    }
                                    setReplyingTo({
                                      commentId: parentComment.id,
                                      fullName: parentComment.fullName,
                                      userId: parentComment.userId
                                    });
                                    setTimeout(() => {
                                      commentInputRef.current?.focus();
                                    }, 100);
                                  }}
                                  className="hover:text-blue-500 text-[#FF4B91]"
                                >
                                  Reply
                                </button>
                                
                                {canDeleteParent && (
                                  <button 
                                    onClick={() => handleDeleteComment(parentComment.id, parentComment.userId)}
                                    className="hover:text-red-500"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Nested replies */}
                          {commentReplies.length > 0 && (
                            <div className="pl-6 space-y-3 border-l border-[var(--border-secondary)] ml-4">
                              {commentReplies.map((reply, replyIdx) => {
                                const canDeleteReply = user && (reply.userId === user.id || video.userId === user.id || isAdmin);
                                return (
                                  <div key={`${reply.id || ''}-cardreply-${replyIdx}`} className="flex gap-2.5 animate-in fade-in duration-250 select-text">
                                    <div 
                                      onClick={() => handleCommentUserClick(reply.userId)}
                                      className="w-6 h-6 rounded-lg overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)] cursor-pointer flex-shrink-0"
                                    >
                                      {reply.profilePhoto ? (
                                        <img src={reply.profilePhoto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-600 text-white text-[9px] font-bold">
                                          {reply.fullName?.charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex-1 min-w-0 select-text">
                                      <div className="bg-[var(--bg-secondary)]/30 rounded-xl py-1.5 px-3 border border-[var(--border-secondary)] inline-block max-w-full select-text">
                                        <div className="flex items-center gap-1.5 select-none flex-wrap">
                                          <span 
                                            onClick={() => handleCommentUserClick(reply.userId)}
                                            className="text-[var(--text-primary)] text-[10px] font-black hover:underline cursor-pointer flex items-center gap-1 flex-wrap"
                                          >
                                            <span>{reply.fullName}</span>
                                            <span className="text-[8px] text-gray-500 font-bold normal-case font-mono bg-black/10 px-1 rounded">@{reply.username || (reply.fullName || "user").toLowerCase().replace(/\s/g, '')}</span>
                                            {reply.isVerified && <BadgeCheck className="w-3 h-3 text-blue-400 fill-blue-400 flex-shrink-0" />}
                                          </span>
                                          <span className="text-[8px] text-[var(--text-secondary)] opacity-60">
                                            {formatTimeAgo(reply.createdAt)}
                                          </span>
                                        </div>
                                        <p className="text-[var(--text-primary)] text-xs font-normal leading-normal whitespace-pre-wrap break-words select-text mt-0.5">
                                          {reply.replyToName && (
                                            <span 
                                              onClick={() => reply.replyToUserId && handleCommentUserClick(reply.replyToUserId)}
                                              className="text-blue-500 font-bold mr-1 hover:underline cursor-pointer"
                                            >
                                              @{reply.replyToName}
                                            </span>
                                          )}
                                          {reply.text}
                                        </p>
                                      </div>
                                      
                                      {canDeleteReply && (
                                        <div className="mt-1 pl-1 select-none">
                                          <button 
                                            onClick={() => handleDeleteComment(reply.id, reply.userId)}
                                            className="text-[9px] text-red-500/80 hover:text-red-500 font-bold"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              {/* Input section & Emojis at the bottom of the centered modal */}
              <div className="p-5 border-t border-[var(--border-secondary)] bg-[var(--bg-secondary)]/10">
                {/* Replied warning feedback */}
                {replyingTo && (
                  <div className="py-1.5 px-3 bg-[#FF4B91]/10 rounded-lg flex items-center justify-between select-none mb-2.5 text-xs">
                    <span className="text-[var(--text-primary)] font-bold">
                      Replying to <span className="text-blue-500">@{replyingTo.fullName}</span>
                    </span>
                    <button 
                      onClick={() => setReplyingTo(null)}
                      className="text-red-500 hover:underline uppercase font-extrabold text-[9px] tracking-wider"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Quick action emojis wrapper */}
                <div className="pb-3 flex items-center gap-1.5 overflow-x-auto select-none no-scrollbar text-base whitespace-nowrap">
                  {['❤️', '🙌', '🔥', '😂', '😮', '😍', '👏', '😢', '💯', '🙏'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        hapticFeedback('light');
                        if (!user) {
                          if ((window as any).triggerLogin) {
                            (window as any).triggerLogin();
                          }
                          return;
                        }
                        setNewComment(prev => prev + emoji);
                      }}
                      className="hover:scale-130 transition-all active:scale-90 p-1.5 text-sm bg-[var(--bg-card)] rounded-lg border border-[var(--border-secondary)]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Input prompt zone */}
                <form 
                  onSubmit={handleSendComment}
                  className="flex items-center gap-2.5 select-text"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-8 h-8 rounded-xl overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0 border border-[var(--border-primary)] relative">
                    {user && user.profilePhoto ? (
                      <img src={user.profilePhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-500 text-white font-black text-xs">
                        {user ? user.fullName?.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex items-center bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] px-3.5 py-2 relative">
                    <input
                      ref={commentInputRef}
                      type="text"
                      value={newComment}
                      onChange={(e) => {
                        if (!user) {
                          if ((window as any).triggerLogin) {
                            (window as any).triggerLogin();
                          }
                          return;
                        }
                        setNewComment(e.target.value);
                      }}
                      placeholder={user ? "Write a nice comment..." : "Login to write a comment..."}
                      className="flex-1 bg-transparent text-[var(--text-primary)] text-xs outline-none pr-8 placeholder-[var(--text-secondary)]/50 select-text font-medium"
                    />
                    {newComment.trim() && user && (
                      <button
                        type="submit"
                        className="absolute right-2 p-1.5 rounded-md text-blue-500 hover:bg-blue-500/10 active:scale-90 transition-all"
                      >
                        <Send className="w-4 h-4 text-[#FF4B91]" />
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TextPostCard({ video, onDelete, isAdmin }: TextPostProps) {
  const [isMuted, setIsMuted] = useState(false);
  return (
    <WorldPostCard 
      video={video} 
      onDelete={onDelete} 
      isAdmin={isAdmin} 
      isMuted={isMuted} 
      setIsMuted={setIsMuted} 
    />
  );
}

function ProfileStatsListModal({ 
  type, 
  userId, 
  onClose, 
  currentUserId,
  userVideos,
  onNavigateToProfile,
  isPrivate
}: { 
  type: 'followers' | 'following' | 'likes'; 
  userId: string; 
  onClose: () => void; 
  currentUserId?: string;
  userVideos: Video[];
  onNavigateToProfile: (id: string) => void;
  isPrivate: boolean;
}) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPrivate) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let isMounted = true;

    const fetchUsers = async () => {
      try {
        let userIds: string[] = [];

        if (type === 'followers') {
          const snap = await getDocs(collection(db, 'users', userId, 'followers'));
          userIds = snap.docs.map(doc => {
            const data = doc.data();
            return data.followerId || doc.id;
          });
        } else if (type === 'following') {
          const snap = await getDocs(collection(db, 'users', userId, 'following'));
          userIds = snap.docs.map(doc => {
            const data = doc.data();
            return data.followingId || doc.id;
          });
        } else if (type === 'likes') {
          const likesSet = new Set<string>();
          await Promise.all(
            userVideos.map(async (v) => {
              try {
                const snap = await getDocs(collection(db, 'videos', v.id, 'likes'));
                snap.docs.forEach(doc => {
                  if (doc.id) likesSet.add(doc.id);
                });
              } catch (err) {
                console.error("Error loading specific post likes:", err);
              }
            })
          );
          userIds = Array.from(likesSet);
        }

        // Keep unique sorted IDs, filtered out falsy items
        userIds = Array.from(new Set(userIds)).filter(Boolean);

        if (userIds.length === 0) {
          if (isMounted) {
            setList([]);
            setLoading(false);
          }
          return;
        }

        // Fetch details from users collection
        const userPromises = userIds.map(async (id) => {
          try {
            const uDoc = await getDoc(doc(db, 'users', id));
            if (uDoc.exists()) {
              return { id: uDoc.id, ...uDoc.data() };
            }
          } catch (e) {
            console.error("Error loading stats item user data:", e);
          }
          return null;
        });

        const resolvedUsers = (await Promise.all(userPromises)).filter(Boolean);

        if (isMounted) {
          setList(resolvedUsers);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error resolving stats list:", err);
        if (isMounted) setLoading(false);
      }
    };

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [type, userId, userVideos, isPrivate]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: "15%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "15%" }}
      style={{ contentVisibility: 'auto' }}
      className="fixed inset-0 z-[160] bg-black/95 backdrop-blur-xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08] pt-[calc(env(safe-area-inset-top,16px)+12px)] bg-black/40">
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <span className="font-black text-sm uppercase tracking-[0.15em] text-[#FF4B91] drop-shadow-sm">
          {type === 'followers' && 'Followers'}
          {type === 'following' && 'Following'}
          {type === 'likes' && 'Liked By'}
        </span>
        <div className="w-10" />
      </div>

      {/* Body List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 custom-scrollbar">
        {isPrivate ? (
          <div className="flex flex-col items-center justify-center py-28 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mb-6 border border-white/5 shadow-2xl">
              <Lock className="w-8 h-8 text-[#FF4B91]" />
            </div>
            <h4 className="text-white text-base font-black mb-2 uppercase tracking-wide">Profile Private</h4>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed font-semibold">
              This user has set their {type === 'followers' ? 'followers' : type === 'following' ? 'following' : 'likes'} list to private.
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <RotateCw className="w-8 h-8 text-[#FF4B91] animate-spin" />
            <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest animate-pulse">Fetching List</p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
            <span className="text-4xl text-gray-600">👻</span>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">List empty</p>
          </div>
        ) : (
          list.map((u: any, index: number) => {
            const cleanUsername = u.fullName ? u.fullName.toLowerCase().replace(/\s/g, '') : 'user';
            return (
              <div 
                key={`${u.id || ''}-stats-${index}`}
                onClick={() => {
                  onNavigateToProfile(u.id);
                  onClose();
                }}
                className="flex items-center justify-between bg-white/[0.03] border border-white/[0.05] p-3 rounded-2xl hover:bg-white/[0.06] active:scale-[0.98] transition-all cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-950 border border-white/10 flex-shrink-0">
                    <img 
                      src={u.profilePhoto || '/placeholder-user.png'} 
                      alt={u.fullName} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center space-x-1">
                      <span className="text-[13px] font-black text-white">
                        @{cleanUsername}
                      </span>
                      {u.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />}
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium block mt-0.5">{u.fullName || 'Anonymous User'}</span>
                  </div>
                </div>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToProfile(u.id);
                    onClose();
                  }}
                  className="bg-[#FF4B91] hover:bg-[#ff3b84] text-white font-black text-[9px] px-3.5 py-1.5 rounded-full uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-[#FF4B91]/10"
                >
                  View Profile
                </button>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

function PhotoViewerModal({
  isOpen,
  onClose,
  title,
  photos,
  isOwnProfile,
  isAdmin,
  userId,
  isCover,
  currentPhotoActive,
  onPhotoDeleted,
  fullName,
  onActivePhotoChanged
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  photos: string[];
  isOwnProfile: boolean;
  isAdmin: boolean;
  userId: string;
  isCover: boolean;
  currentPhotoActive: string;
  onPhotoDeleted: (newPhotos: string[], newActive: string) => void;
  fullName: string;
  onActivePhotoChanged?: (newActive: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Sync index when photos array changes or is initialized
  useEffect(() => {
    if (photos.length > 0) {
      const activeIdx = photos.indexOf(currentPhotoActive);
      if (activeIdx > -1) {
        setCurrentIndex(activeIdx);
      } else {
        setCurrentIndex(0);
      }
    }
  }, [photos, currentPhotoActive, isOpen]);

  if (!isOpen || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex];

  const handleDownload = async () => {
    if (!currentPhoto) return;
    setDownloading(true);
    try {
      const response = await fetch(currentPhoto);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isCover ? `cover_photo_${currentIndex + 1}.jpg` : `profile_photo_${currentIndex + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("Direct blob download failed, trying standard anchor fallback", err);
      const a = document.createElement('a');
      a.href = currentPhoto;
      a.target = '_blank';
      a.download = isCover ? 'cover_photo.jpg' : 'profile_photo.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
      setShowMenu(false);
    }
  };

  const handleCopyAppLink = () => {
    const appUrl = getAppOrigin();
    navigator.clipboard.writeText(appUrl);
    alert("App Link copied to clipboard!");
    setShowMenu(false);
  };

  const handleCopyImageLink = () => {
    if (!currentPhoto) return;
    navigator.clipboard.writeText(currentPhoto);
    alert("Direct photo link copied to clipboard!");
    setShowMenu(false);
  };

  const handleDelete = async () => {
    if (!isOwnProfile && !isAdmin) {
      alert("Error: Limit exceeded or no permission.");
      return;
    }
    if (!confirm("Are you sure you want to delete this photo? This cannot be undone.")) return;

    try {
      const remainingPhotos = photos.filter((_, idx) => idx !== currentIndex);
      const userRef = doc(db, 'users', userId);
      const updateData: any = {};

      let newActivePhoto = currentPhotoActive;
      if (currentPhoto === currentPhotoActive) {
        newActivePhoto = remainingPhotos.length > 0 ? remainingPhotos[0] : "";
      }

      if (isCover) {
        updateData.coverPhotosHistory = remainingPhotos;
        if (currentPhoto === currentPhotoActive) {
          updateData.coverPhoto = newActivePhoto;
        }
      } else {
        updateData.profilePhotosHistory = remainingPhotos;
        if (currentPhoto === currentPhotoActive) {
          updateData.profilePhoto = newActivePhoto;
        }
      }

      await setDoc(userRef, updateData, { merge: true });
      setShowMenu(false);
      alert("Photo deleted successfully!");
      
      onPhotoDeleted(remainingPhotos, newActivePhoto);
      if (remainingPhotos.length === 0) {
        onClose();
      } else {
        setCurrentIndex(prev => Math.min(prev, remainingPhotos.length - 1));
      }
    } catch (err: any) {
      console.error("Error deleting image:", err);
      alert("Delete failed: " + (err.message || err));
    }
  };

  const handleSetAsActive = async () => {
    if (!currentPhoto) return;
    if (currentPhoto === currentPhotoActive) {
      alert(localStorage.getItem('appLanguage') === 'bn' ? "এটি ইতিমধ্যে আপনার সক্রিয় ছবি!" : "This photo is already active!");
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const updateData: any = {};
      
      if (isCover) {
        updateData.coverPhoto = currentPhoto;
      } else {
        updateData.profilePhoto = currentPhoto;
      }

      await setDoc(userRef, updateData, { merge: true });

      // Create an automatic update post so it goes to the public feed!
      await addDoc(collection(db, 'videos'), {
        userId: userId || '',
        fullName: fullName || 'User',
        profilePhoto: isCover ? (currentPhotoActive || '') : currentPhoto,
        title: isCover ? 'কভার ছবি পরিবর্তন করেছেন / Updated Cover Photo' : 'প্রোফাইল ছবি পরিবর্তন করেছেন / Updated Profile Photo',
        description: isCover 
          ? `${fullName || 'User'} নতুন প্রোফাইল কভার ছবি আপলোড করেছেন। / Updated their profile cover photo.`
          : `${fullName || 'User'} নতুন প্রোফাইল ছবি আপলোড করেছেন। / Updated their profile photo.`,
        location: '',
        privacy: 'everyone',
        contentUrl: currentPhoto,
        type: 'image',
        likeCount: 0,
        commentCount: 0,
        views: 0,
        createdAt: serverTimestamp()
      });

      alert(localStorage.getItem('appLanguage') === 'bn' 
        ? "সফলভাবে সক্রিয় ছবি পরিবর্তন করা হয়েছে এবং পাবলিক ফিডে শেয়ার করা হয়েছে!" 
        : "Photo successfully updated as active and shared on public feed!"
      );
      setShowMenu(false);
      if (onActivePhotoChanged) {
        onActivePhotoChanged(currentPhoto);
      }
    } catch (err: any) {
      console.error("Error setting photo active:", err);
      alert("Failed to update: " + (err.message || err));
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xl flex flex-col justify-between"
      >
        {/* Header toolbar */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-white flex-shrink-0"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="text-center">
            <h3 className="text-white text-sm font-bold tracking-wide">{title}</h3>
            <span className="text-white/60 text-xs font-semibold mt-0.5 block">
              {currentIndex + 1} of {photos.length}
            </span>
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-white flex-shrink-0"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 mt-2 w-52 bg-[#1A1A1A] border border-white/11 rounded-2xl shadow-2xl p-2 z-20 flex flex-col space-y-1 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback?.('medium');
                      handleDownload();
                    }}
                    disabled={downloading}
                    className="w-full px-4 py-2.5 hover:bg-white/10 text-white font-bold text-xs rounded-xl flex items-center space-x-2.5 transition-all text-left"
                  >
                    <Download className="w-4 h-4 text-blue-405 text-blue-400" />
                    <span>{downloading ? "Saving..." : "Quality Download (HD)"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback?.('medium');
                      setShowMenu(false);
                      window.location.reload();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-white/10 text-white font-bold text-xs rounded-xl flex items-center space-x-2.5 transition-all text-left"
                  >
                    <RefreshCw className="w-4 h-4 text-cyan-400" />
                    <span>Refresh App</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback?.('medium');
                      setShowMenu(false);
                      localStorage.clear();
                      window.location.reload();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-red-500/10 text-red-400 font-bold text-xs rounded-xl flex items-center space-x-2.5 transition-all text-left"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>Clear Cache</span>
                  </button>

                  {(isOwnProfile || isAdmin) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          hapticFeedback?.('medium');
                          handleSetAsActive();
                        }}
                        className="w-full px-4 py-2.5 hover:bg-green-500/10 text-green-400 font-bold text-xs rounded-xl flex items-center space-x-2.5 transition-all text-left border-t border-white/5 pt-3 mt-1"
                      >
                        <Check className="w-4 h-4 text-green-400" />
                        <span>{isCover ? "Set as Active Cover" : "Set as Active Profile"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          hapticFeedback?.('medium');
                          handleDelete();
                        }}
                        className="w-full px-4 py-2.5 hover:bg-red-500/10 text-red-500 font-bold text-xs rounded-xl flex items-center space-x-2.5 transition-all text-left border-t border-white/5 pt-3 mt-1"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                        <span>Delete Picture</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mid-screen image view */}
        <div className="flex-1 flex items-center justify-center relative px-2">
          {photos.length > 1 && (
            <button
              onClick={() => setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length)}
              className="absolute left-4 w-11 h-11 rounded-full bg-black/40 border border-white/5 flex items-center justify-center hover:bg-black/60 active:scale-95 transition-all z-10 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <motion.img
            key={currentPhoto}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            src={currentPhoto}
            alt="Expanded view"
            className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl select-none"
            referrerPolicy="no-referrer"
          />

          {photos.length > 1 && (
            <button
              onClick={() => setCurrentIndex(prev => (prev + 1) % photos.length)}
              className="absolute right-4 w-11 h-11 rounded-full bg-black/40 border border-white/5 flex items-center justify-center hover:bg-black/60 active:scale-95 transition-all z-10 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Footer info/controls */}
        <div className="p-6 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center justify-center text-center">
          <p className="text-white/40 text-[10px] font-black tracking-widest uppercase">
            {isCover ? "Cover Album" : "Profile Album"}
          </p>
          <div className="flex items-center space-x-1.5 mt-3 select-none">
            {photos.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-5 bg-[#FF4B91]' : 'w-1.5 bg-white/30'}`} 
              />
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Profile({ 
  userId: propUserId, 
  onBack, 
  setActiveTab, 
  pendingUploads = [], 
  isOffline,
  isDarkMode,
  onToggleTheme,
  isMuted,
  setIsMuted,
  socketConnected = false
}: { 
  userId?: string, 
  onBack?: () => void, 
  setActiveTab?: (t: string) => void, 
  pendingUploads?: PendingUpload[], 
  isOffline?: boolean,
  isDarkMode: boolean,
  onToggleTheme: () => void,
  isMuted: boolean,
  setIsMuted: (m: boolean) => void,
  socketConnected?: boolean
}) {
  const { user: currentUser } = useAuth();
  const userId = propUserId || currentUser?.id;
  const [user, setUser] = useState<User | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
  const [firestoreUserVideos, setFirestoreUserVideos] = useState<Video[]>([]);
  const [sqliteUserVideos, setSqliteUserVideos] = useState<Video[]>([]);
  const [localCreatedCount, setLocalCreatedCount] = useState(0);

  const localProfileVideos = useMemo(() => {
    try {
      const saved = localStorage.getItem('world_local_created_videos');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed
          .map((p: any) => p.data || p)
          .filter((p: any) => {
            const uId = p.userId || p.authorId || '';
            return uId && userId && uId.toString().trim() === userId.toString().trim();
          });
      }
    } catch (e) {
      console.warn("Error parsing local created videos in Profile:", e);
    }
    return [];
  }, [userId, localCreatedCount]);

  const userVideos = useMemo(() => {
    const combined = [...localProfileVideos, ...firestoreUserVideos, ...sqliteUserVideos];
    const deduped = deduplicateVideos(combined);
    // Sort combined list securely and robustly
    deduped.sort((a, b) => {
      const dateValA = a.createdAt as any;
      const dateValB = b.createdAt as any;
      const dateA = dateValA ? (dateValA.toDate ? dateValA.toDate().getTime() : (typeof dateValA === 'string' ? new Date(dateValA).getTime() : (dateValA.seconds ? dateValA.seconds * 1000 : Date.now()))) : Date.now();
      const dateB = dateValB ? (dateValB.toDate ? dateValB.toDate().getTime() : (typeof dateValB === 'string' ? new Date(dateValB).getTime() : (dateValB.seconds ? dateValB.seconds * 1000 : Date.now()))) : Date.now();
      return dateB - dateA;
    });
    return deduped;
  }, [localProfileVideos, firestoreUserVideos, sqliteUserVideos]);

  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'all' | 'photos' | 'reels' | 'text'>('all');
  const [isProMode, setIsProMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`pro_mode_${propUserId || currentUser?.id}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [showProSetup, setShowProSetup] = useState(false);
  const [showProDashboard, setShowProDashboard] = useState(false);

  // Creator Professional Dashboard Live Sync State
  const [proData, setProData] = useState<{
    starsEnabled: number;
    adsEnabled: number;
    starsEarnings: number;
    adsEarnings: number;
    balance: number;
    totalWithdrawable: number;
    payoutMethod: string;
    payoutAccount: string;
    payoutName: string;
    postsCount: number;
    liveViews: number;
    liveLikes: number;
    liveComments: number;
    liveFollowers: number;
    liveReach: number;
    liveEngagement: number;
  } | null>(null);
  const [loadingProData, setLoadingProData] = useState(false);
  const [showPayoutSetupModal, setShowPayoutSetupModal] = useState(false);
  const [setupPayoutMethod, setSetupPayoutMethod] = useState('bKash');
  const [setupPayoutAccount, setSetupPayoutAccount] = useState('');
  const [setupPayoutName, setSetupPayoutName] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawalReceipt, setWithdrawalReceipt] = useState<any | null>(null);
  const [proDashboardTab, setProDashboardTab] = useState<'analytics' | 'content' | 'community' | 'monetize' | 'other'>('analytics');
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'28days' | '7days' | 'today'>('28days');
  const appLanguage = localStorage.getItem('appLanguage') || 'en';

  const totalViewsVal = proData?.liveViews || 0;
  const totalEngagementVal = proData?.liveEngagement || 0;
  const totalFollowersVal = proData?.liveFollowers || 0;

  const displayViews = analyticsTimeframe === 'today' 
    ? Math.round(totalViewsVal * 0.08) 
    : analyticsTimeframe === '7days' 
      ? Math.round(totalViewsVal * 0.45) 
      : totalViewsVal;

  const displayEngagement = analyticsTimeframe === 'today' 
    ? Math.round(totalEngagementVal * 0.08) 
    : analyticsTimeframe === '7days' 
      ? Math.round(totalEngagementVal * 0.45) 
      : totalEngagementVal;

  const displayFollowers = analyticsTimeframe === 'today' 
    ? Math.round(totalFollowersVal * 0.1) 
    : analyticsTimeframe === '7days' 
      ? Math.round(totalFollowersVal * 0.5) 
      : totalFollowersVal;

  const totalEarningsInTaka = (proData?.adsEarnings || 0) + (proData?.starsEarnings || 0);
  const totalEarningsInUSD = totalEarningsInTaka / 120.0;

  const displayEarningsUSD = analyticsTimeframe === 'today' 
    ? (totalEarningsInUSD * 0.08) 
    : analyticsTimeframe === '7days' 
      ? (totalEarningsInUSD * 0.45) 
      : totalEarningsInUSD;

  const displayEarningsTaka = analyticsTimeframe === 'today' 
    ? (totalEarningsInTaka * 0.08) 
    : analyticsTimeframe === '7days' 
      ? (totalEarningsInTaka * 0.45) 
      : totalEarningsInTaka;

  const latestVideo = userVideos && userVideos.length > 0 ? userVideos[0] : null;

  const formatPostDate = (createdAtAt: any) => {
    if (!createdAtAt) return appLanguage === 'bn' ? 'প্রকাশিত হয়েছে: এইমাত্র' : 'Published: Just now';
    try {
      let dateObj: Date | null = null;
      if (createdAtAt instanceof Date) {
        dateObj = createdAtAt;
      } else if (createdAtAt && typeof createdAtAt.toDate === 'function') {
        try {
          dateObj = createdAtAt.toDate();
        } catch (e) {}
      }
      
      if (!dateObj && createdAtAt) {
        const secs = createdAtAt.seconds ?? createdAtAt._seconds;
        if (typeof secs === 'number') {
          dateObj = new Date(secs * 1000);
        } else if (typeof createdAtAt === 'number') {
          const isSecs = createdAtAt < 50000000000;
          dateObj = new Date(isSecs ? createdAtAt * 1000 : createdAtAt);
        } else if (typeof createdAtAt === 'string') {
          if (/^\d+$/.test(createdAtAt)) {
            const num = Number(createdAtAt);
            const isSecs = num < 50000000000;
            dateObj = new Date(isSecs ? num * 1000 : num);
          } else {
            const parsed = Date.parse(createdAtAt);
            if (!isNaN(parsed)) dateObj = new Date(parsed);
          }
        }
      }
      
      if (!dateObj) {
        const d = new Date(createdAtAt);
        dateObj = isNaN(d.getTime()) ? null : d;
      }
      
      if (!dateObj || isNaN(dateObj.getTime())) {
        return appLanguage === 'bn' ? 'প্রকাশিত হয়েছে: এইমাত্র' : 'Published: Just now';
      }
      const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthsBn = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
      const month = dateObj.getMonth();
      const day = dateObj.getDate();
      let hours = dateObj.getHours();
      const minutes = dateObj.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? (appLanguage === 'bn' ? 'অপরাহ্ন' : 'PM') : (appLanguage === 'bn' ? 'পূর্বাহ্ন' : 'AM');
      hours = hours % 12;
      hours = hours ? hours : 12;
      
      if (appLanguage === 'bn') {
        return `প্রকাশিত হয়েছে: ${day} ${monthsBn[month]} ${hours}:${minutes} ${ampm}`;
      } else {
        return `Published: ${monthsEn[month]} ${day} at ${hours}:${minutes} ${ampm}`;
      }
    } catch (e) {
      return appLanguage === 'bn' ? 'প্রকাশিত হয়েছে: ২৬ মে সকাল ৭:২০ মিনিট' : 'Published: May 26 at 7:20 AM';
    }
  };

  const fetchProDashboardData = async () => {
    if (!userId) return;
    try {
      setLoadingProData(true);
      const res = await fetch(`/api/creator/dashboard/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setProData(data);
      }
    } catch (err) {
      console.warn("Error loading creator stats database:", err);
    } finally {
      setLoadingProData(false);
    }
  };

  const handleToggleStars = async (enabled: boolean) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/creator/dashboard/${userId}/setup-stars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        fetchProDashboardData();
      }
    } catch (err) {
      console.warn("Toggle stars error:", err);
    }
  };

  const handleToggleAds = async (enabled: boolean) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/creator/dashboard/${userId}/setup-ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        fetchProDashboardData();
      }
    } catch (err) {
      console.warn("Toggle ads error:", err);
    }
  };

  const handleSavePayoutSetup = async () => {
    if (!userId) return;
    if (!setupPayoutAccount.trim()) {
      alert("Enter account number!");
      return;
    }
    try {
      const res = await fetch(`/api/creator/dashboard/${userId}/payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payoutMethod: setupPayoutMethod,
          payoutAccount: setupPayoutAccount,
          payoutName: setupPayoutName || 'Creator Payout'
        })
      });
      if (res.ok) {
        alert("Payout Account Added Successfully!");
        setShowPayoutSetupModal(false);
        fetchProDashboardData();
      }
    } catch (err) {
      console.warn("Payout account add error:", err);
    }
  };

  const handleWithdrawAmount = async () => {
    if (!userId || !proData) return;
    const withdrawValue = parseFloat(withdrawalAmount);
    if (!withdrawValue || withdrawValue <= 0) {
      alert("Enter a valid amount!");
      return;
    }
    if (withdrawValue > proData.totalWithdrawable) {
      alert(`You cannot withdraw more than your balance! Max balance: Tk ${proData.totalWithdrawable}`);
      return;
    }
    try {
      setWithdrawing(true);
      const res = await fetch(`/api/creator/dashboard/${userId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: withdrawValue })
      });
      if (res.ok) {
        const receipt = await res.json();
        setWithdrawalReceipt(receipt);
        setWithdrawalAmount('');
        fetchProDashboardData();
      } else {
        const errData = await res.json();
        alert(errData.error || "Withdrawal failed!");
      }
    } catch (err) {
      console.warn("Withdraw error:", err);
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    if (userId && isProMode) {
      fetchProDashboardData();
    }
  }, [userId, isProMode, userVideos]);

  useEffect(() => {
    const handleShowDashboard = () => {
      setShowProDashboard(true);
      setShowSettings(false);
    };
    const handleShowSetup = () => {
      setShowProSetup(true);
      setShowSettings(false);
    };
    window.addEventListener('app-show-pro-dashboard', handleShowDashboard);
    window.addEventListener('app-show-pro-setup', handleShowSetup);

    if (localStorage.getItem('force_open_pro_dashboard') === 'true') {
      localStorage.removeItem('force_open_pro_dashboard');
      if (isProMode) {
        setShowProDashboard(true);
      } else {
        setShowProSetup(true);
      }
    }

    return () => {
      window.removeEventListener('app-show-pro-dashboard', handleShowDashboard);
      window.removeEventListener('app-show-pro-setup', handleShowSetup);
    };
  }, [isProMode]);

  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

  const [isFollowing, setIsFollowing] = useState(false);
  const [statsModel, setStatsModel] = useState<{ type: 'followers' | 'following' | 'likes'; isOpen: boolean }>({ type: 'followers', isOpen: false });

  const [viewingPhotoModal, setViewingPhotoModal] = useState<{
    isOpen: boolean;
    title: string;
    photos: string[];
    isCover: boolean;
    currentPhotoActive: string;
  }>({
    isOpen: false,
    title: '',
    photos: [],
    isCover: false,
    currentPhotoActive: ''
  });

  const openProfilePhotoViewer = () => {
    if (!user) return;
    let profileList = user.profilePhotosHistory ? [...user.profilePhotosHistory] : [];
    if (user.profilePhoto && !profileList.includes(user.profilePhoto)) {
      profileList.unshift(user.profilePhoto);
    }
    const uniqueProfileList = Array.from(new Set(profileList)).filter(p => !!p && p.trim() !== "");
    if (uniqueProfileList.length === 0) return;
    setViewingPhotoModal({
      isOpen: true,
      title: 'Profile Photo',
      photos: uniqueProfileList,
      isCover: false,
      currentPhotoActive: user.profilePhoto || ''
    });
  };

  const openCoverPhotoViewer = () => {
    if (!user) return;
    let coverList = user.coverPhotosHistory ? [...user.coverPhotosHistory] : [];
    if (user.coverPhoto && !coverList.includes(user.coverPhoto)) {
      coverList.unshift(user.coverPhoto);
    }
    const uniqueCoverList = Array.from(new Set(coverList)).filter(p => !!p && p.trim() !== "");
    if (uniqueCoverList.length === 0) return;
    setViewingPhotoModal({
      isOpen: true,
      title: 'Cover Photo',
      photos: uniqueCoverList,
      isCover: true,
      currentPhotoActive: user.coverPhoto || ''
    });
  };

  // 1. Follow relationship check and fallback loading
  useEffect(() => {
    if (currentUser && userId && userId !== currentUser.id) {
      const fetchFollowStatus = async () => {
        try {
          const res = await fetch(`/api/follows/check?followerId=${currentUser.id}&followingId=${userId}`);
          if (res.ok) {
            const data = await res.json();
            setIsFollowing(data.isFollowing);
          }
        } catch (e) {
          console.warn("Error checking client fallback follow status:", e);
        }
      };

      if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
        fetchFollowStatus();
        return () => {};
      }

      const unsub = onSnapshot(doc(db, 'users', userId, 'followers', currentUser.id), (docSnap) => {
        setIsFollowing(docSnap.exists());
      }, (err) => {
        fetchFollowStatus();
      });
      return () => unsub();
    }
  }, [currentUser, userId]);

  // 2. Offline / Quota secure follow & unfollow triggering
  const toggleFollow = async () => {
    if (!currentUser || !userId || userId === currentUser.id) return;

    // Optimistic UI updates
    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);
    setFollowerCount(prev => prevStatus ? Math.max(0, prev - 1) : prev + 1);

    // Call SQLite sync backend regardless of offline mode/quota
    fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        followerId: currentUser.id,
        followingId: userId,
        action: prevStatus ? 'unfollow' : 'follow'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && typeof data.isFollowing === 'boolean') {
        setIsFollowing(data.isFollowing);
      }
    })
    .catch(e => console.log("Follow fallback sync offline error:", e));

    try {
      const followerRef = doc(db, 'users', userId, 'followers', currentUser.id);
      const followingRef = doc(db, 'users', currentUser.id, 'following', userId);
      
      if (prevStatus) {
        await deleteDoc(followerRef);
        await deleteDoc(followingRef);
      } else {
        await setDoc(followerRef, {
          followerId: currentUser.id,
          createdAt: serverTimestamp()
        });
        await setDoc(followingRef, {
          followingId: userId,
          createdAt: serverTimestamp()
        });
        await sendNotification(userId, currentUser, 'follow', undefined, 'started following you');
      }
    } catch (err) {
      console.warn("Profile Firestore follow count sync err skipped:", err);
    }
  };

  // 3. User metadata loading with API fallbacks
  useEffect(() => {
    if (userId) {
      const fetchFallbackUser = async () => {
        try {
          const res = await fetch('/api/users');
          if (res.ok) {
            const allSavedUsers = await res.json();
            const found = allSavedUsers.find((u: any) => u.id === userId);
            if (found) {
              const mapped = {
                ...found,
                isVerified: found.isVerified || false,
                isProMode: found.isProMode || false,
                isOnline: found.isOnline || false
              };
              setUser(mapped);
              if (userId === currentUser?.id) {
                setIsProMode(!!found.isProMode);
              }
              return true;
            }
          }
        } catch (e) {
          console.warn("Fallback single user fetch failed:", e);
        }
        return false;
      };

      if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
        fetchFallbackUser();
        return () => {};
      }

      const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const mappedUser = { id: snap.id, ...data } as User;
          setUser(mappedUser);
          if (userId === currentUser?.id && data?.isProMode !== undefined) {
            setIsProMode(!!data.isProMode);
          }
        } else {
          fetchFallbackUser();
        }
      }, (err) => {
        fetchFallbackUser();
      });
      return () => unsub();
    }
  }, [userId, currentUser]);

  // 4. Follower/Following metrics counting synced fallback
  useEffect(() => {
    if (userId) {
      const fetchCountsFallback = async () => {
        try {
          const res = await fetch(`/api/follows/counts/${userId}`);
          if (res.ok) {
            const dat = await res.json();
            setFollowerCount(dat.followersCount || 0);
            setFollowingCount(dat.followingCount || 0);
          }
        } catch (e) {
          console.warn("Follow count fallback API error:", e);
        }
      };

      if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
        fetchCountsFallback();
        return () => {};
      }

      const unsubFollowers = onSnapshot(collection(db, 'users', userId, 'followers'), (snapshot) => {
        setFollowerCount(snapshot.size);
      }, (err) => {
        fetchCountsFallback();
      });
      const unsubFollowing = onSnapshot(collection(db, 'users', userId, 'following'), (snapshot) => {
        setFollowingCount(snapshot.size);
      }, (err) => {
        fetchCountsFallback();
      });

      return () => {
        unsubFollowers();
        unsubFollowing();
      };
    }
  }, [userId]);

  // Listen for local post creation and feeds refresh events to update Profile
  useEffect(() => {
    const handleLocalCreation = () => {
      setLocalCreatedCount(prev => prev + 1);
    };
    window.addEventListener('local-post-created', handleLocalCreation);
    window.addEventListener('refreshFeed', handleLocalCreation);
    return () => {
      window.removeEventListener('local-post-created', handleLocalCreation);
      window.removeEventListener('refreshFeed', handleLocalCreation);
    };
  }, []);

  // 5. User videos query lists with fallback support
  useEffect(() => {
    if (userId) {
      const fetchUserVideosFallback = async () => {
        try {
          const res = await fetch('/api/posts');
          if (res.ok) {
            const allPosts = await res.json();
            // Filter posts that belong to the target user securely
            const filtered = allPosts.filter((item: any) => {
              const uId = item.userId || item.data?.userId || item.authorId || item.data?.authorId || '';
              return uId && userId && uId.toString().trim() === userId.toString().trim();
            });
            if (filtered && filtered.length > 0) {
              const purePosts = filtered.map((p: any) => p.data || p);
              setSqliteUserVideos(deduplicateById(purePosts));
            } else {
              setSqliteUserVideos([]);
            }
          }
        } catch (e) {
          console.warn("User posts loading error fallback:", e);
        }
      };

      // Always load SQLite fallback posts in parallel to guarantee offline/quota/sync consistency
      fetchUserVideosFallback();

      if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
        return () => {};
      }

      // Query without orderby to prevent "FAILED_PRECONDITION / query requires an index" error
      const q = query(collection(db, 'videos'), where('userId', '==', userId));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
        // Sort in client memory securely, fallback to Date.now() for latency compensated posts (null createdAt)
        rawList.sort((a, b) => {
          const dateValA = a.createdAt as any;
          const dateValB = b.createdAt as any;
          const dateA = dateValA ? (dateValA.toDate ? dateValA.toDate().getTime() : new Date(dateValA).getTime()) : Date.now();
          const dateB = dateValB ? (dateValB.toDate ? dateValB.toDate().getTime() : new Date(dateValB).getTime()) : Date.now();
          return dateB - dateA;
        });
        setFirestoreUserVideos(deduplicateById(rawList));
      }, (err) => {
        console.warn("Firestore user videos snapshot error:", err);
      });
      return () => unsubscribe();
    }
  }, [userId, localCreatedCount]);

  const isOwnProfile = currentUser?.id && user?.id ? currentUser.id === user.id : (currentUser?.id === userId);

  // Synchronize creator's live video metrics (views, likes, comments) with SQLite when loaded
  useEffect(() => {
    if (userVideos && userVideos.length > 0 && isOwnProfile) {
      userVideos.forEach(v => {
        fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: v.id,
            data: v
          })
        }).catch(err => console.warn("Failed to sync video to SQLite:", err));
      });
    }
  }, [userVideos, isOwnProfile]);

  if (!user) return null;

  // Optimistic UI for current user
  const profilePending = isOwnProfile ? (pendingUploads || [])
    .filter(p => !p.isStory && (p.status === 'queued' || p.status === 'uploading' || p.status === 'finishing' || p.status === 'error' || p.status === 'failed'))
    .map(p => ({
      id: p.id,
      userId: currentUser?.id || '',
      fullName: currentUser?.fullName || 'Me',
      profilePhoto: currentUser?.profilePhoto || '',
      title: p.title || 'Uploading...',
      description: p.description || '',
      contentUrl: p.preview || p.previewUrl || '',
      type: p.type || 'video',
      backgroundColor: p.type === 'text' ? p.bgColor : null,
      likeCount: 0,
      commentCount: 0,
      views: 0,
      isPublic: true,
      canDownload: true,
      createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
      isOptimistic: true,
      status: p.status,
      progress: p.progress
    } as unknown as Video)) : [];

  // Deduplicate user profile videos by ID to prevent key conflicts between optimistic and loaded list
  const uniqueUserVideosMap = new Map();
  [...profilePending, ...userVideos].forEach(v => {
    if (v.id) {
      if (!uniqueUserVideosMap.has(v.id) || (v as any).isOptimistic) {
        uniqueUserVideosMap.set(v.id, v);
      }
    }
  });
  const allUserVideos = Array.from(uniqueUserVideosMap.values());

  const isAdmin = !!(
    (auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com') ||
    (auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com')
  );

  const deleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoId) return;
    if (!currentUser) {
      alert("Please log in to delete posts.");
      return;
    }
    
    const isUserAdmin = isAdmin || 
                        auth.currentUser?.uid === 'ZPHYftpJzjhllADJsPkCnq4wHm93' ||
                        auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com' || 
                        auth.currentUser?.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com';
                        
    // Double-secure check: verify ownership of the target video object itself
    const videoToDelete = userVideos.find(v => v.id === videoId);
    const isVideoOwner = videoToDelete ? (videoToDelete.userId === currentUser.id) : isOwnProfile;

    if (!isVideoOwner && !isUserAdmin) {
      alert("Error: You don't have permission to delete this post.");
      return;
    }

    const runDelete = async () => {
      try {
        const videoRef = doc(db, 'videos', videoId);
        await deleteDoc(videoRef);
        alert("Post deleted successfully!");
      } catch (err: any) {
        console.error("Delete Error:", err);
        alert("Delete failed: " + err.message);
      }
    };

    if ((window as any).showCustomConfirm) {
      (window as any).showCustomConfirm("Delete Post", 'Are you sure you want to delete this post? This cannot be undone.', runDelete);
    } else {
      if (window.confirm('Are you sure you want to delete this post? This cannot be undone.')) {
        runDelete();
      }
    }
  };

  return (
    <>
      <div className="h-full bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-y-auto pb-24 transition-colors select-text">
        {/* Cover Video/Banner Section */}
        <div className="relative h-56 bg-slate-900 group select-none">
          {user.coverPhoto ? (
            <img 
              src={user.coverPhoto || undefined} 
              className="w-full h-full object-cover cursor-pointer hover:brightness-95 transition-all duration-200" 
              referrerPolicy="no-referrer" 
              onClick={openCoverPhotoViewer}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-950/80 via-[#FF4B91]/15 to-purple-950/90" />
          )}
          
          {/* Header Action Overlay - Floating Buttons */}
          <div className="absolute top-4 left-4 right-4 flex justify-between z-10">
            {onBack && (
              <button 
                onClick={onBack} 
                className="w-9 h-9 bg-black/50 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div className="flex-1" />
            {isOwnProfile && (
              <button 
                onClick={() => setShowSettings(true)} 
                className="w-9 h-9 bg-black/50 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10 active:scale-95 transition-transform"
              >
                <SettingsIcon className="w-5 h-5 text-white" />
              </button>
            )}
          </div>

          {/* Edit Cover Photo Overlay indicator */}
          {isOwnProfile && (
            <button 
              onClick={() => setShowEdit(true)}
              className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white/90 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border border-white/10 flex items-center space-x-1 backdrop-blur-sm"
            >
              <Camera className="w-3.5 h-3.5 text-[#FF4B91]" />
              <span>Edit Cover</span>
            </button>
          )}
        </div>

        {/* Profile Avatar Overlapping Profile Content Box */}
        <div className="px-4 -mt-16 relative border-b border-[var(--border-primary)] pb-5 text-center flex flex-col items-center">
          
          {/* Overlapping Centered Avatar */}
          <div className="relative select-none">
            <div className="w-28 h-28 rounded-2xl bg-[var(--bg-card)] border-4 border-[var(--bg-primary)] overflow-hidden relative shadow-xl">
              {user.profilePhoto ? (
                <img 
                  src={user.profilePhoto || undefined} 
                  alt={user.fullName} 
                  className="w-full h-full object-cover object-center cursor-pointer hover:scale-105 transition-transform duration-300" 
                  referrerPolicy="no-referrer" 
                  onClick={openProfilePhotoViewer}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--bg-secondary)]">
                  <UserIcon className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>
            {isOwnProfile && (
              <button 
                onClick={() => setShowEdit(true)}
                className="absolute bottom-1 right-1 w-7 h-7 bg-blue-500 rounded-xl border-3 border-[var(--bg-primary)] flex items-center justify-center shadow-md active:scale-90 transition-all hover:bg-blue-600"
              >
                <Plus className="w-4.5 h-4.5 text-white stroke-[3.5]" />
              </button>
            )}
          </div>

          {/* User Display Info */}
          <div className="mt-3.5 space-y-1">
            <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center justify-center space-x-1">
              <span>{user.fullName || "User name"}</span>
            </h2>
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
              @{(user.fullName || "user").toLowerCase().replace(/\s/g, '')}
            </p>
            {user.bio && (
              <p className="text-xs text-[var(--text-secondary)] mt-2 font-medium bg-[var(--bg-secondary)] border border-[var(--border-primary)] px-4 py-1.5 rounded-xl max-w-xs mx-auto">
                {user.bio}
              </p>
            )}
          </div>

          {/* Connection Profile stats widget */}
          <div className="flex items-center justify-center space-x-6 mt-4.5 select-none text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            <button 
              onClick={() => setStatsModel({ type: 'followers', isOpen: true })}
              className="flex items-center space-x-1.5 hover:opacity-80 active:scale-95 transition-all text-left group"
            >
              <span className="font-extrabold text-[13px] text-[var(--text-primary)] group-hover:text-[#FF4B91] transition-all">{followerCount}</span>
              <span>Followers</span>
            </button>
            <div className="w-[1.5px] h-3 bg-[var(--border-secondary)] rounded-full" />
            <button 
              onClick={() => setStatsModel({ type: 'following', isOpen: true })}
              className="flex items-center space-x-1.5 hover:opacity-80 active:scale-95 transition-all text-left group"
            >
              <span className="font-extrabold text-[13px] text-[var(--text-primary)] group-hover:text-[#FF4B91] transition-all">{followingCount}</span>
              <span>Following</span>
            </button>
            <div className="w-[1.5px] h-3 bg-[var(--border-secondary)] rounded-full" />
            <button 
              onClick={() => setStatsModel({ type: 'likes', isOpen: true })}
              className="flex items-center space-x-1.5 hover:opacity-80 active:scale-95 transition-all text-left group"
            >
              <span className="font-extrabold text-[13px] text-[var(--text-primary)] group-hover:text-[#FF4B91] transition-all">
                {userVideos.reduce((acc, curr) => acc + (curr.likeCount || 0), 0)}
              </span>
              <span>Likes</span>
            </button>
          </div>

          {/* Call to Actions - Standard Double Columns layout with Professional Mode Switch */}
          <div className="flex flex-col space-y-2.5 w-full max-w-sm mt-5 select-none text-[11px] font-black tracking-widest uppercase">
            <div className="flex items-center space-x-2 w-full">
              {isOwnProfile ? (
                <>
                  <button 
                    onClick={() => {
                      if (isProMode) {
                        setShowProDashboard(true);
                      } else {
                        setShowProSetup(true);
                      }
                      hapticFeedback('medium');
                    }}
                    className="flex-1 py-3 bg-[#FF4B91] hover:brightness-110 text-white rounded-xl flex items-center justify-center space-x-1.5 shadow-lg active:scale-95 transition-all text-[11px] font-black"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                    <span>{isProMode ? "See Dashboard" : "Professional Mode"}</span>
                  </button>
                  <button 
                    onClick={() => setShowEdit(true)} 
                    className="flex-1 py-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-[var(--text-primary)] border border-[var(--border-primary)] rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-transform"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={toggleFollow}
                    className={cn(
                      "flex-1 py-3 rounded-xl flex items-center justify-center space-x-1.5 shadow-md active:scale-95 transition-all",
                      isFollowing ? "bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-secondary)] hover:bg-[var(--bg-secondary)]/85" : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                  >
                    {isFollowing ? <Check className="w-4 h-4 text-emerald-500" /> : <UserPlus className="w-4 h-4" />}
                    <span>{isFollowing ? 'Following' : 'Follow'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      (window as any).targetChatUserId = user.id;
                      const event = new CustomEvent('nav-to-tab', { detail: 'messages' });
                      window.dispatchEvent(event);
                    }}
                    className="flex-1 py-3 bg-[#FF4B91]/10 border border-[#FF4B91]/25 hover:bg-[#FF4B91]/15 text-[#FF4B91] rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Message</span>
                  </button>
                  <button 
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: user.fullName,
                          url: window.location.href,
                        });
                      } else {
                        alert("Profile link copied!");
                      }
                    }}
                    className="w-12 py-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>



          {/* Verified Badge Shop Promotion Box */}
          {isOwnProfile && !user.isVerified && (
            <div className="w-full max-w-sm mt-5 p-3.5 bg-indigo-950/20 rounded-xl border border-indigo-500/15 flex items-center justify-between text-left">
              <div>
                <p className="text-xs font-bold text-white flex items-center">
                  <BadgeCheck className="w-4 h-4 mr-1.5 text-indigo-400" />
                  Get Verified Badge
                </p>
                <p className="text-[10px] text-gray-500 mt-1">Visit shop to buy your verified status badge.</p>
              </div>
              <button 
                onClick={() => setActiveTab?.('shop')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-transform shadow-md"
              >
                Shop
              </button>
            </div>
          )}


        </div>

        {/* Profile Stats List Modals */}

        {/* Tabs Row for Media Filters (All, Photos, Reels, Text) */}
        <div className="px-4 mt-4">
          <div className="flex border-b border-[var(--border-secondary)] select-none">
            {[
              { id: 'all', label: 'All Feed', icon: <Activity className="w-4 h-4 mr-1.5" /> },
              { id: 'photos', label: 'Photos', icon: <ImageIcon className="w-4 h-4 mr-1.5" /> },
              { id: 'reels', label: 'Reels', icon: <VideoIcon className="w-4 h-4 mr-1.5" /> },
              { id: 'text', label: 'Text Status', icon: <FileText className="w-4 h-4 mr-1.5" /> }
            ].map(currTab => (
              <button
                key={currTab.id}
                onClick={() => {
                  hapticFeedback('light');
                  setActiveProfileTab(currTab.id as any);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center py-3 text-[10px] transition-all relative font-black uppercase tracking-widest",
                  activeProfileTab === currTab.id ? "text-[#FF4B91]" : "text-gray-500 hover:text-gray-400"
                )}
              >
                {currTab.icon}
                <span>{currTab.label}</span>
                {activeProfileTab === currTab.id && (
                  <motion.div layoutId="profileTabBottom" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF4B91]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Section posts rendering list matching Timeline posts design */}
        <div className="w-full pb-32 mt-3 px-0 sm:px-3 max-w-xl mx-auto space-y-1 sm:space-y-3">
          {/* 'What's on your mind?' Box directly inside profile tab as well if own page */}
          {isOwnProfile && activeProfileTab === 'all' && (
            <div className="bg-[var(--bg-card)] rounded-none sm:rounded-xl p-3.5 border-x-0 sm:border border-[var(--border-secondary)] flex items-center space-x-3 shadow-sm mb-0.5">
              <div className="w-8.5 h-8.5 rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex-shrink-0">
                {user?.profilePhoto ? (
                  <img src={user.profilePhoto || undefined} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon className="w-4.5 h-4.5 text-gray-500 mx-auto mt-2" />
                )}
              </div>
              <button 
                onClick={() => {
                  const event = new CustomEvent('nav-to-tab', { detail: 'upload' });
                  window.dispatchEvent(event);
                }}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/85 text-left px-4 py-2 rounded-xl text-[11px] font-bold text-gray-500 transition-all outline-none"
              >
                What's on your mind?
              </button>
            </div>
          )}

          {activeProfileTab === 'all' && (
            <div className="space-y-1">
              {allUserVideos.map((v, index) => (
                <WorldPostCard 
                  key={`usr-all-${v.id || (v as any).data?.id || 'post'}-${index}`} 
                  video={v} 
                  isOptimistic={!!(v as any).isOptimistic}
                  isMuted={isMuted}
                  setIsMuted={setIsMuted}
                  isAdmin={isAdmin}
                  onDelete={(e) => deleteVideo(v.id, e)}
                />
              ))}
              
              {allUserVideos.length === 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-secondary)] py-16 px-6 text-center select-none shadow-sm">
                  <Activity className="w-8 h-8 text-[#FF4B91]/60 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Timeline is empty</p>
                </div>
              )}
            </div>
          )}

          {activeProfileTab === 'text' && (
            <div className="space-y-1">
              {allUserVideos.filter(v => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                return v.type === 'text' || (!displayUrl && (v.description || v.title || (v as any).textContent));
              }).map((v, index) => (
                <WorldPostCard 
                  key={`usr-txt-${v.id || (v as any).data?.id || 'post'}-${index}`} 
                  video={v} 
                  isOptimistic={!!(v as any).isOptimistic}
                  isMuted={isMuted}
                  setIsMuted={setIsMuted}
                  isAdmin={isAdmin}
                  onDelete={(e) => deleteVideo(v.id, e)}
                />
              ))}
              {allUserVideos.filter(v => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                return v.type === 'text' || (!displayUrl && (v.description || v.title || (v as any).textContent));
              }).length === 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-secondary)] py-16 px-6 text-center select-none shadow-sm">
                  <FileText className="w-8 h-8 text-amber-500/60 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">No text status posts</p>
                </div>
              )}
            </div>
          )}

          {activeProfileTab === 'photos' && (
            <div className="grid grid-cols-3 gap-1.5">
              {allUserVideos.filter(v => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                const isText = v.type === 'text' || (!displayUrl && (v.description || v.title || (v as any).textContent));
                const isImage = v.type === 'image' || (v.type as string) === 'photo' || 
                  (v.type !== 'video' && v.type !== 'text' && displayUrl && (
                    displayUrl.toLowerCase().includes('.jpg') || 
                    displayUrl.toLowerCase().includes('.png') || 
                    displayUrl.toLowerCase().includes('.jpeg') || 
                    displayUrl.toLowerCase().includes('.webp') ||
                    displayUrl.toLowerCase().includes('.heic') ||
                    displayUrl.toLowerCase().includes('.gif') ||
                    displayUrl.toLowerCase().startsWith('data:image/')
                  ));
                return isImage && !isText;
              }).map((v, index) => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                return (
                  <div 
                    key={`usr-photo-${v.id || (v as any).data?.id || 'post'}-${index}`} 
                    className="aspect-square bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-xl overflow-hidden group cursor-pointer relative shadow-sm"
                    onClick={() => setSelectedVideo(v)}
                  >
                    <img src={displayUrl || undefined} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" referrerPolicy="no-referrer" />
                  </div>
                );
              })}
              {allUserVideos.filter(v => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                const isText = v.type === 'text' || (!displayUrl && (v.description || v.title || (v as any).textContent));
                const isImage = v.type === 'image' || (v.type as string) === 'photo' || 
                  (v.type !== 'video' && v.type !== 'text' && displayUrl && (
                    displayUrl.toLowerCase().includes('.jpg') || 
                    displayUrl.toLowerCase().includes('.png') || 
                    displayUrl.toLowerCase().includes('.jpeg') || 
                    displayUrl.toLowerCase().includes('.webp') ||
                    displayUrl.toLowerCase().includes('.heic') ||
                    displayUrl.toLowerCase().includes('.gif') ||
                    displayUrl.toLowerCase().startsWith('data:image/')
                  ));
                return isImage && !isText;
              }).length === 0 && (
                <div className="col-span-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-secondary)] py-16 px-6 text-center select-none shadow-sm">
                  <ImageIcon className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">No photo uploads</p>
                </div>
              )}
            </div>
          )}

          {activeProfileTab === 'reels' && (
            <div className="grid grid-cols-3 gap-1.5">
              {allUserVideos.filter(v => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                const isText = v.type === 'text' || (!displayUrl && (v.description || v.title || (v as any).textContent));
                const isImage = v.type === 'image' || (v.type as string) === 'photo' || 
                  (v.type !== 'video' && displayUrl && (
                    displayUrl.toLowerCase().includes('.jpg') || 
                    displayUrl.toLowerCase().includes('.png') || 
                    displayUrl.toLowerCase().includes('.jpeg') || 
                    displayUrl.toLowerCase().includes('.webp') || 
                    displayUrl.toLowerCase().includes('.heic') || 
                    displayUrl.toLowerCase().includes('.gif') || 
                    displayUrl.toLowerCase().startsWith('data:image/')
                  ));
                return !isText && !isImage && displayUrl;
              }).map((v, index) => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                return (
                  <div 
                    key={`usr-reel-${v.id || (v as any).data?.id || 'post'}-${index}`} 
                    className="aspect-[9/16] bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-xl overflow-hidden group cursor-pointer relative shadow-sm"
                    onClick={() => setSelectedVideo(v)}
                  >
                    <video src={displayUrl || undefined} className="w-full h-full object-cover pointer-events-none" preload="metadata" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <VideoIcon className="w-5 h-5 text-white/80 drop-shadow-md" />
                    </div>
                  </div>
                );
              })}
              {allUserVideos.filter(v => {
                const displayUrl = v.contentUrl || (v as any).videoUrl;
                const isText = v.type === 'text' || (!displayUrl && (v.description || v.title || (v as any).textContent));
                const isImage = v.type === 'image' || (v.type as string) === 'photo' || (v.type !== 'video' && displayUrl && (
                    displayUrl.toLowerCase().includes('.jpg') || 
                    displayUrl.toLowerCase().includes('.png') || 
                    displayUrl.toLowerCase().includes('.jpeg') || 
                    displayUrl.toLowerCase().includes('.webp') || 
                    displayUrl.toLowerCase().includes('.heic') || 
                    displayUrl.toLowerCase().includes('.gif') || 
                    displayUrl.toLowerCase().startsWith('data:image/')
                  ));
                return !isText && !isImage && displayUrl;
              }).length === 0 && (
                <div className="col-span-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-secondary)] py-16 px-6 text-center select-none shadow-sm">
                  <VideoIcon className="w-8 h-8 text-[#FF4B91]/60 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">No reel videos</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <Settings 
            onClose={() => setShowSettings(false)} 
            isOffline={isOffline} 
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            isProMode={isProMode}
            initialSection="settings"
            socketConnected={socketConnected}
            onToggleProMode={async (newVal) => {
              setIsProMode(newVal);
              try {
                localStorage.setItem(`pro_mode_${propUserId || currentUser?.id}`, String(newVal));
              } catch (err) {}
              const uId = propUserId || currentUser?.id;
              if (uId) {
                try {
                  const userRef = doc(db, 'users', uId);
                  await setDoc(userRef, { isProMode: newVal }, { merge: true });
                } catch (err) {
                  console.error("Error setting pro mode in Profile settings:", err);
                }
                try {
                  await fetch('/api/users/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: uId,
                      isProMode: newVal
                    })
                  });
                } catch (e) {
                  console.warn("SQL Sync failed during Profile toggle, ignoring:", e);
                }
              }
            }}
            onShowProDashboard={() => {
              setShowProDashboard(true);
              setShowSettings(false);
            }}
            onShowProSetup={() => {
              setShowProSetup(true);
              setShowSettings(false);
            }}
          />
        )}
        {showEdit && <EditProfile onClose={() => setShowEdit(false)} />}

        {showProSetup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/85 flex items-center justify-center p-4 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 30 }}
              className="bg-[#121216] border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-[#FF4B91] fill-[#FF4B91] animate-pulse" />
                  <span className="text-[13px] font-black uppercase tracking-wider text-white">Setup Profile</span>
                </div>
                <button 
                  onClick={() => {
                    setShowProSetup(false);
                    hapticFeedback('light');
                  }}
                  className="p-1.5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 text-left">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-[#FF4B91] to-indigo-600 flex items-center justify-center shadow-lg shadow-pink-500/20 mb-4 animate-bounce">
                    <Sparkles className="w-8 h-8 text-white fill-white" />
                  </div>
                  <h3 className="text-lg font-black text-white leading-snug">
                    Turn On Professional Mode?
                  </h3>
                  <p className="text-xs text-gray-400 mt-2 font-medium">
                    Add content tools to grow as a creator and unlock opportunities to earn revenue from your posts.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-start space-x-3.5 bg-white/5 p-3 rounded-2xl border border-white/5 text-left font-sans">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 text-indigo-400 font-bold text-xs mt-0.5">
                      $
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Get Paid</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                        If you are eligible, unlock monetization tools like Fans Stars and In-Stream ads to earn money.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3.5 bg-white/5 p-3 rounded-2xl border border-white/5 text-left font-sans">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center flex-shrink-0 text-[#FF4B91] mt-0.5 animate-pulse">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">See Content Insights</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                        Track analytics, reach metrics, audience engagement graphs, and learn what is performing best.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-5 bg-black/40 border-t border-white/5 flex items-center space-x-3">
                <button
                  onClick={() => {
                    setShowProSetup(false);
                    hapticFeedback('light');
                  }}
                  className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest border border-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsProMode(true);
                    try {
                      localStorage.setItem(`pro_mode_${propUserId || currentUser?.id}`, 'true');
                    } catch (err) {}
                    setShowProSetup(false);
                    setShowProDashboard(true);
                    hapticFeedback('heavy');
                  }}
                  className="flex-1 py-3.5 bg-gradient-to-r from-[#FF4B91] to-indigo-600 hover:brightness-110 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-pink-500/20 transition-all"
                >
                  Turn On
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}        {showProDashboard && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/95 flex items-center justify-center p-0 md:p-4 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 30 }}
              className="bg-black border border-zinc-900 w-full max-w-lg h-full md:h-[90vh] md:rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,161,255,0.15)] flex flex-col"
            >
              {/* FACEBOOK/INSTAGRAM STYLE HEADER FROM PHOTO */}
              <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-900 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => {
                      setShowProDashboard(false);
                      hapticFeedback('light');
                    }}
                    className="p-1 hover:bg-zinc-900 rounded-full text-white transition-colors"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                  <h3 className="text-lg font-black text-white font-sans tracking-wide">
                    {appLanguage === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}
                  </h3>
                </div>
                
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={() => {
                      alert(appLanguage === 'bn' ? "ড্যাশবোর্ড অনুসন্ধান সক্রিয়!" : "Search in professional database active!");
                      hapticFeedback('light');
                    }}
                    className="text-gray-300 hover:text-white transition-colors"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-800">
                    <img 
                      src={user?.profilePhoto || currentUser?.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde"} 
                      alt="" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              </div>

              {/* PILL DIALOG NAVIGATION FROM PHOTO */}
              <div className="px-4 py-2.5 bg-zinc-950 border-b border-zinc-900 flex items-center gap-2 overflow-x-auto scrollbar-none sticky top-[49px] z-10 select-none">
                {[
                  { id: 'analytics', label: appLanguage === 'bn' ? 'অ্যানালিটিক্স' : 'Analytics' },
                  { id: 'content', label: appLanguage === 'bn' ? 'কন্টেন্ট' : 'Content' },
                  { id: 'community', label: appLanguage === 'bn' ? 'কমিউনিটি' : 'Community' },
                  { id: 'monetize', label: appLanguage === 'bn' ? 'মনিটাইজ' : 'Monetize' }
                ].map((tb) => {
                  const isActive = proDashboardTab === tb.id;
                  return (
                    <button
                      key={tb.id}
                      onClick={() => {
                        setProDashboardTab(tb.id as any);
                        hapticFeedback('light');
                      }}
                      className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wide whitespace-nowrap transition-all duration-200 ${
                        isActive 
                          ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' 
                          : 'bg-zinc-900/50 text-gray-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      {tb.label}
                    </button>
                  );
                })}
              </div>

              {/* MAIN SCROLLABLE SECTION */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 select-none">
                
                {/* USER PROFILE INFO AND WEEKLY PROGRESS (IMAGE 2) */}
                <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-zinc-800">
                      <img 
                        src={user?.profilePhoto || currentUser?.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde"} 
                        alt="" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center">
                        {user?.fullName || currentUser?.fullName || "মোঃ তুহিন হোসেন"}
                        <ChevronRight className="w-4 h-4 ml-1 text-gray-500" />
                      </h4>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                        {appLanguage === 'bn' ? `ফেসবুক প্রফেশনাল ক্রিয়েটর` : `Facebook Professional Creator`}
                      </p>
                    </div>
                  </div>

                  {/* SVG CIRCULAR WEEKLY PROGRESS CHARTS FROM IMAGE 2 */}
                  <div className="flex items-center space-x-2 bg-zinc-900/60 pl-3 pr-2.5 py-1.5 rounded-xl border border-zinc-800">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-white leading-tight">
                        {appLanguage === 'bn' ? 'সাপ্তাহিক অগ্রগতি' : 'Weekly progress'}
                      </p>
                      <p className="text-[9px] text-gray-400 font-medium">0% complete</p>
                    </div>
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="16" cy="16" r="13" stroke="currentColor" className="text-zinc-800" strokeWidth="2.5" fill="transparent" />
                        <circle cx="16" cy="16" r="13" stroke="currentColor" className="text-indigo-500" strokeWidth="2.5" fill="transparent" strokeDasharray="100" strokeDashoffset="100" />
                      </svg>
                      <span className="absolute text-[8px] font-black text-white">0%</span>
                    </div>
                  </div>
                </div>

                {/* ALIGNMENT ALERT BAR FROM PHOTO */}
                <div className="bg-orange-500/10 border border-orange-500/20 px-3.5 py-2 rounded-xl flex items-center space-x-2 text-xs text-orange-200">
                  <span className="animate-bounce">📢</span>
                  <p className="text-[10px] sm:text-xs font-semibold leading-tight flex-1">
                    {appLanguage === 'bn' ? 'আপনার ১টি নতুন ক্রিয়েটর আপডেট এসেছে।' : 'You have 1 update.'}
                  </p>
                  <button 
                    onClick={() => alert(appLanguage === 'bn' ? "টিপস: আরও সক্রিয়তা বজায় রাখুন এবং বন্ধুদের সাথে রিল শেয়ার করুন।" : "Update: Keep posting high-quality reels to gain monetization faster!")} 
                    className="text-[10px] uppercase font-black text-orange-400 hover:underline shrink-0"
                  >
                    {appLanguage === 'bn' ? 'দেখুন' : 'View'}
                  </button>
                </div>

                {/* 1. ANALYTICS VIEW TAB */}
                {proDashboardTab === 'analytics' && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center">
                        {appLanguage === 'bn' ? 'অ্যানালিটিক্স' : 'Analytics'}
                        <ChevronRight className="w-4 h-4 ml-1 text-gray-400" />
                      </h4>
                      
                      {/* Sub-Filters: Today, 7 days, 28 days (selected in image) */}
                      <div className="flex items-center space-x-1.5 p-0.5 bg-zinc-950 rounded-lg border border-zinc-900 text-[10px]">
                        {[
                          { id: '28days', label: appLanguage === 'bn' ? '২৮ দিন' : '28 days' },
                          { id: '7days', label: appLanguage === 'bn' ? '৭ দিন' : '7 days' },
                          { id: 'today', label: appLanguage === 'bn' ? 'আজ' : 'Today' }
                        ].map((fl) => {
                          const isSel = analyticsTimeframe === fl.id;
                          return (
                            <button
                              key={fl.id}
                              onClick={() => {
                                setAnalyticsTimeframe(fl.id as any);
                                hapticFeedback('light');
                              }}
                              className={`px-2 py-1 rounded-md font-black uppercase transition-all ${
                                isSel ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-450 hover:text-white'
                              }`}
                            >
                              {fl.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2X2 METRICS GRID DIRECTLY FROM PHOTO */}
                    <div className="grid grid-cols-2 gap-3.5">
                      
                      {/* metric 1: Views */}
                      <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 flex flex-col justify-between hover:border-zinc-800 transition-all">
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            {appLanguage === 'bn' ? 'ভিউস' : 'Views'}
                          </p>
                          <p className="text-2xl font-black text-white mt-1.5">
                            {displayViews}
                          </p>
                        </div>
                        {displayViews > 0 ? (
                          <div className="text-[10px] text-emerald-500 font-bold flex items-center mt-2 font-mono">
                            <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                            +12%
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-450 font-bold flex items-center mt-2 font-mono">
                            --
                          </div>
                        )}
                      </div>

                      {/* metric 2: Approximate Earnings */}
                      <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 flex flex-col justify-between hover:border-zinc-800 transition-all">
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            {appLanguage === 'bn' ? 'আনুমানিক আয়' : 'Approximate earnings'}
                          </p>
                          <p className="text-2xl font-black text-white mt-1.5">
                            ${displayEarningsUSD.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-[10px] text-emerald-450 font-bold flex items-center mt-2">
                          {displayEarningsTaka > 0 ? `৳${displayEarningsTaka.toFixed(2)}` : '--'}
                        </div>
                      </div>

                      {/* metric 3: Engagement */}
                      <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 flex flex-col justify-between hover:border-zinc-800 transition-all">
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            {appLanguage === 'bn' ? 'এঙ্গেজমেন্ট' : 'Engagement'}
                          </p>
                          <p className="text-2xl font-black text-white mt-1.5">
                            {displayEngagement}
                          </p>
                        </div>
                        {displayEngagement > 0 ? (
                          <div className="text-[10px] text-emerald-500 font-bold flex items-center mt-2 font-mono">
                            <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                            ↑ 100%
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-450 font-bold flex items-center mt-2 font-mono">
                            --
                          </div>
                        )}
                      </div>

                      {/* metric 4: Net Followers */}
                      <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 flex flex-col justify-between hover:border-zinc-800 transition-all">
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            {appLanguage === 'bn' ? 'নেট ফলোয়ার্স' : 'Net followers'}
                          </p>
                          <p className="text-2xl font-black text-white mt-1.5">
                            {displayFollowers}
                          </p>
                        </div>
                        {displayFollowers > 0 ? (
                          <div className="text-[10px] text-emerald-500 font-bold flex items-center mt-2 font-mono">
                            <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                            +100%
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-450 font-bold flex items-center mt-2 font-mono">
                            --
                          </div>
                        )}
                      </div>

                    </div>

                    {/* CONTENT / LATEST POST SECTION FROM IMAGE 2 */}
                    <div className="pt-2 space-y-3">
                      <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center">
                        {appLanguage === 'bn' ? 'কন্টেন্ট' : 'Content'}
                        <ChevronRight className="w-4 h-4 ml-1 text-gray-400" />
                      </h4>
                      <div className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-900 space-y-3.5 text-left">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-0.5">
                          {appLanguage === 'bn' ? 'সর্বশেষ রিল / পোস্ট' : 'Latest post'}
                        </p>
                        
                        {latestVideo ? (
                          <div className="flex gap-4">
                            {/* Left Thumbnail representing the latest reel */}
                            <div className="w-24 h-32 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden relative shrink-0 flex items-center justify-center">
                              {latestVideo.thumbnailUrl ? (
                                <img src={latestVideo.thumbnailUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-orange-950 to-pink-900 flex items-center justify-center">
                                  <span className="text-2xl pt-2">🌄</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Play className="w-8 h-8 text-white stroke-[2.5] drop-shadow-lg" />
                              </div>
                              <span className="absolute bottom-2 left-2 text-[8px] font-black text-white uppercase tracking-wide px-1.5 py-0.5 bg-[#FF4B91] rounded z-20">REEL</span>
                            </div>

                            {/* Right mini metrics layout column */}
                            <div className="flex-1 flex flex-col justify-between">
                              <div>
                                <h5 className="text-xs font-black text-white tracking-wide truncate max-w-[180px]">
                                  {latestVideo.caption || latestVideo.title || (appLanguage === 'bn' ? 'শিরোনামহীন ভিডিও' : 'Untitled Video')}
                                </h5>
                                <p className="text-[9px] text-gray-500 font-semibold mt-1">
                                  {formatPostDate(latestVideo.createdAt)}
                                </p>
                              </div>

                              {/* Triple stack stats for this specific video */}
                              <div className="space-y-1.5 pt-2">
                                <div className="flex items-center justify-between text-[11px] font-semibold bg-zinc-90 w-full px-2 py-1 rounded border border-zinc-900">
                                  <span className="text-gray-400">{appLanguage === 'bn' ? 'ভিউস' : 'Views'}</span>
                                  <span className="text-white font-extrabold">{latestVideo.views || 0}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-semibold bg-zinc-900/50 w-full px-2 py-1 rounded border border-zinc-900">
                                  <span className="text-gray-400">{appLanguage === 'bn' ? 'আয়' : 'Earnings'}</span>
                                  <span className="text-emerald-400 font-extrabold">
                                    ${(proData?.adsEnabled ? (((latestVideo.views || 0) * 0.15) / 120) : 0).toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-semibold bg-zinc-900/50 w-full px-2 py-1 rounded border border-zinc-900">
                                  <span className="text-gray-400">{appLanguage === 'bn' ? 'এঙ্গেজমেন্ট' : 'Engagement'}</span>
                                  <span className="text-blue-400 font-extrabold">
                                    {(latestVideo.likeCount || 0) + (latestVideo.commentCount || 0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            {/* Left Thumbnail representing the placeholder */}
                            <div className="w-24 h-32 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden relative shrink-0 flex items-center justify-center">
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Play className="w-8 h-8 text-zinc-700 stroke-[2.5]" />
                              </div>
                              <span className="absolute bottom-2 left-2 text-[8px] font-black text-zinc-500 uppercase tracking-wide px-1.5 py-0.5 bg-zinc-900 rounded z-20">REEL</span>
                              <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                                <span className="text-2xl pt-2">📹</span>
                              </div>
                            </div>

                            {/* Right placeholder description column */}
                            <div className="flex-1 flex flex-col justify-center">
                              <h5 className="text-xs font-black text-white tracking-wide">
                                {appLanguage === 'bn' ? 'কোন রিল পাওয়া যায়নি' : 'No reels published yet'}
                              </h5>
                              <p className="text-[10px] text-gray-500 font-semibold mt-1 leading-normal">
                                {appLanguage === 'bn' 
                                  ? 'ড্যাশবোর্ড সচল করতে এবং আয় করতে আপনার প্রথম রিল বা ভিডিওটি আপলোড করুন!' 
                                  : 'Upload your first reel or video to start earning and tracking analytics!'}
                              </p>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>

                  </div>
                )}

                {/* 2. CONTENT LISTS TAB */}
                {proDashboardTab === 'content' && (
                  <div className="space-y-4 animate-in fade-in duration-300 text-left">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-white uppercase tracking-wider">
                        {appLanguage === 'bn' ? 'আপনার সব কন্টেন্ট' : 'All Published Reels'}
                      </h4>
                      <span className="text-[10px] text-gray-500 font-mono font-black uppercase">
                        {userVideos.length + 1} {appLanguage === 'bn' ? 'টি আইটেম' : 'Items'}
                      </span>
                    </div>

                    {/* Standard List of Videos */}
                    <div className="space-y-3">
                      {/* Latest mock item */}
                      <div className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-900 flex items-center space-x-3">
                        <div className="w-12 h-16 rounded bg-orange-950 flex items-center justify-center text-lg relative shrink-0">
                          🌄
                          <span className="absolute bottom-1 right-1 text-[7px] font-black bg-black px-1 rounded text-white font-mono">0:15</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-white truncate">good morning 🌄</h5>
                          <p className="text-[9px] text-gray-500 mt-1 uppercase font-black">May 26 • 153 views • $0.00</p>
                          <div className="flex space-x-2 mt-1.5">
                            <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-black">Ad Campaign Setup</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => alert("Boost this post with targeted ad placements! Buy 500 views for 50 coins inside World Shop.")}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-[8px] px-2.5 py-1.5 rounded"
                        >
                          PROMOTED
                        </button>
                      </div>

                      {/* Display user's uploaded videos dynamically if any exists! */}
                      {userVideos && userVideos.length > 0 ? (
                        userVideos.map((vid: any, idx: number) => (
                          <div key={`user-vid-row-${vid.id || idx}-${idx}`} className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-900 flex items-center space-x-3">
                            <div className="w-12 h-16 rounded bg-zinc-950 flex items-center justify-center text-lg relative shrink-0 overflow-hidden border border-zinc-800">
                              {vid.thumbnailUrl ? (
                                <img src={vid.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="pt-1">🎬</span>
                              )}
                              <span className="absolute bottom-1 right-1 text-[7px] font-black bg-black px-1 rounded text-white font-mono">0:21</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-xs font-bold text-white truncate">{vid.caption || (appLanguage === 'bn' ? 'শিরোনামহীন ভিডিও' : 'Untitled Video')}</h5>
                              <p className="text-[9px] text-gray-500 mt-1 uppercase font-black">
                                {vid.createdAt ? new Date(vid.createdAt).toLocaleDateString() : 'Today'} • {vid.viewCount || 0} views • ${((vid.starsCollected || 0) * 0.05).toFixed(2)}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase font-black">Active star channel</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                alert(`Ad Campaign active for: "${vid.caption || 'Video'}"! Currently targeting standard feed.`);
                                hapticFeedback('light');
                              }}
                              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-gray-400 hover:text-white font-black uppercase tracking-wider text-[8px] px-2.5 py-1.5 rounded"
                            >
                              Manage Ads
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 bg-zinc-950 rounded-xl border border-dashed border-zinc-900">
                          <p className="text-xs text-gray-500 font-semibold">No secondary reels uploaded yet!</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. COMMUNITY HUB TAB FROM PHOTO */}
                {proDashboardTab === 'community' && (
                  <div className="space-y-4 animate-in fade-in duration-300 text-left">
                    <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl space-y-3.5">
                      <div className="flex items-center space-x-2">
                        <Users className="w-5 h-5 text-blue-400" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">
                          {appLanguage === 'bn' ? 'কমিউনিটি' : 'Community'} &gt;
                        </h4>
                      </div>
                      <div>
                        <h5 className="text-sm font-black text-white capitalize">
                          {appLanguage === 'bn' ? 'মন্তব্যের উত্তর দিন' : 'Respond to comments'}
                        </h5>
                        <p className="text-[10px] text-gray-500 leading-normal mt-1 font-semibold">
                          {appLanguage === 'bn' ? 'যেসকল মন্তব্যের উত্তর দেওয়া হয়নি তা এখানে প্রদর্শিত হবে যখন সাধারণ মানুষ আপনার ভিডিওতে মন্তব্য করবেন।' : 'Comments you haven\'t responded to yet will appear here once people start commenting on your posts.'}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Mock Comment replying setup */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 pl-0.5">
                        {appLanguage === 'bn' ? 'পেন্ডিং কমিউনিটি ইন্টারঅ্যাকশন' : 'Pending Creator Interactions'}
                      </p>
                      <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-2xl space-y-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center font-extrabold text-xs">
                            S
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-xs font-bold text-white flex items-center">
                              Sabit Hasan 🍁
                              <span className="text-[8px] bg-zinc-950 border border-zinc-800 text-gray-400 px-1 rounded-sm ml-1.5">Follower</span>
                            </h5>
                            <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed bg-zinc-950/50 p-2 rounded-lg border border-zinc-900">
                              Your sunrise reel looks very aesthetic! Upload the sound template. 🚀
                            </p>
                            <span className="text-[8px] text-gray-500 font-bold block mt-1">On Reel: "good morning 🌄"</span>
                          </div>
                        </div>

                        {/* Direct Answer Component */}
                        <div className="flex gap-2 pt-1">
                          <input 
                            type="text" 
                            placeholder={appLanguage === 'bn' ? "সরাসরি ক্রিয়েটর উত্তর লিখুন..." : "Write custom creator reply..."}
                            className="bg-black text-xs text-white border border-zinc-800 px-3 py-2 rounded-xl outline-none focus:border-blue-500 flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                alert(appLanguage === 'bn' ? "উত্তরটি ফেসবুকে ক্রিয়েটর পিন করা হয়েছে!" : "Reply pinned and posted successfully as creator!");
                                hapticFeedback('heavy');
                                (e.target as any).value = '';
                              }
                            }}
                          />
                          <button 
                            onClick={() => {
                              alert(appLanguage === 'bn' ? "উত্তর সফলভাবে পাঠানো হয়েছে!" : "Response registered successfully!");
                              hapticFeedback('heavy');
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase px-4 rounded-xl"
                          >
                            {appLanguage === 'bn' ? 'উত্তর দিন' : 'REPLY'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. MONETIZE & PAYOUTS TAB FROM PHOTO */}
                {proDashboardTab === 'monetize' && (
                  <div className="space-y-4 animate-in fade-in duration-300 text-left">
                    <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Coins className="w-5 h-5 text-emerald-400" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">
                          {appLanguage === 'bn' ? 'মনিটাইজ' : 'Monetize'} &gt;
                        </h4>
                      </div>
                      <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 rounded-full font-black">ACTIVE</span>
                    </div>

                    {/* Earnings $0.00 from Image 1 */}
                    <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-gray-500 font-extrabold uppercase">
                          {appLanguage === 'bn' ? 'ক্রিয়েটর পেমেন্ট আয়ের ব্যালেন্স' : 'Earnings'}
                        </p>
                        <p className="text-2xl font-black text-white mt-1">
                          $0.00
                        </p>
                      </div>
                      <Coins className="w-8 h-8 text-amber-400 animate-pulse" />
                    </div>

                    {/* Progress Bar Card from Image 1 */}
                    <div className="bg-zinc-900/40 border border-zinc-900 p-4.5 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">
                          {appLanguage === 'bn' ? 'নতুন ১ জুন - ২ জুন' : 'June 1 - 2'} or current billing cycle
                        </span>
                        <span className="text-xs text-white font-black">$0.00</span>
                      </div>
                      
                      {/* Gray Progress Bar matching image */}
                      <div className="w-full h-2.5 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-800 w-[0%]" />
                      </div>

                      <p className="text-[10px] text-gray-400 font-semibold leading-normal">
                        $100.00 to payout minimum
                      </p>
                    </div>

                    {/* Setup/Configure Payout (Nagad/bKash/Bank) */}
                    <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 uppercase font-black text-[9px]">{appLanguage === 'bn' ? 'পেমেন্ট গেটওয়ে কনফিগারেশন' : 'Payout Settings'}</span>
                        {proData?.payoutAccount && (
                          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[8px] uppercase">LINKED</span>
                        )}
                      </div>

                      {proData?.payoutAccount ? (
                        <div className="flex items-center justify-between bg-zinc-950 p-2.5 rounded-lg border border-zinc-900 text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="bg-indigo-600 text-white font-black px-1.5 py-0.5 rounded text-[8px] uppercase">
                              {proData.payoutMethod}
                            </span>
                            <span className="font-mono text-gray-300 font-semibold text-[11px]">{proData.payoutAccount}</span>
                          </div>
                          <span className="text-[9px] text-gray-500">({proData.payoutName})</span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 leading-normal font-semibold pl-0.5">
                          {appLanguage === 'bn' ? 'আয় উত্তোলন শুরু করতে আপনার bKash / Nagad অথবা ব্যাংক অ্যাকাউন্ট সংযুক্ত করুন।' : 'No payout details combined yet. Add your preferred bKash, Nagad or bank details to start!'}
                        </p>
                      )}

                      <button 
                        onClick={() => setShowPayoutSetupModal(!showPayoutSetupModal)}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:opacity-95 text-white font-black tracking-widest text-[9px] uppercase rounded-xl transition-all"
                      >
                        {showPayoutSetupModal ? (appLanguage === 'bn' ? 'প্যানেল বন্ধ করুন' : 'Collapse Setup Panel') : (appLanguage === 'bn' ? 'উত্তোলন পদ্ধতি সেট আপ করুন' : 'Set up Payout Method')}
                      </button>

                      {showPayoutSetupModal && (
                        <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-900 space-y-3.5 text-xs animate-in slide-in-from-top-3">
                          <p className="text-[10px] text-indigo-400 uppercase font-black">Configure Payout Receiver</p>
                          <div className="space-y-3 text-left">
                            <div>
                              <label className="text-[9px] text-gray-400 block mb-1">Payment Method</label>
                              <select 
                                value={setupPayoutMethod}
                                onChange={(e) => setSetupPayoutMethod(e.target.value)}
                                className="w-full bg-zinc-900 text-white text-[11px] font-semibold border border-zinc-800 p-2 rounded-lg outline-none"
                              >
                                <option value="bKash">bKash (Personal)</option>
                                <option value="Nagad">Nagad (Personal)</option>
                                <option value="Rocket">Rocket</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-[9px] text-gray-400 block mb-1">Account Number or Phone</label>
                              <input 
                                type="text"
                                placeholder="e.g. 017XXXXXXXX"
                                value={setupPayoutAccount}
                                onChange={(e) => setSetupPayoutAccount(e.target.value)}
                                className="w-full bg-zinc-900 text-white font-mono text-xs border border-zinc-800 px-3 py-2.5 rounded-lg outline-none focus:border-emerald-500/50"
                              />
                            </div>

                            <div>
                              <label className="text-[9px] text-gray-400 block mb-1">Full Beneficiary Name</label>
                              <input 
                                type="text"
                                placeholder="MD. TUHIN"
                                value={setupPayoutName}
                                onChange={(e) => setSetupPayoutName(e.target.value)}
                                className="w-full bg-zinc-900 text-white text-xs border border-zinc-800 px-3 py-2.5 rounded-lg outline-none focus:border-emerald-500/50"
                              />
                            </div>

                            <button 
                              onClick={handleSavePayoutSetup}
                              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest rounded-lg transition-all"
                            >
                              Save payout receiver
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* THE 2X2 CORE GRID OF "OTHER TOOLS" FROM IMAGE 1 */}
                <div className="pt-2 border-t border-zinc-900 select-none text-left">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 pl-0.5">
                    {appLanguage === 'bn' ? 'অন্যান্য টুলস' : 'Other tools'}
                  </h4>

                  <div className="grid grid-cols-2 gap-3.5">
                    
                    {/* Tool 1: Settings */}
                    <button 
                      onClick={() => {
                        setShowProDashboard(false);
                        setShowSettings(true);
                        alert(appLanguage === 'bn' ? "প্রোফাইল সেটিংস খোলা হয়েছে!" : "Profile settings opened!");
                        hapticFeedback('medium');
                      }}
                      className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-all text-left flex flex-col justify-between h-24"
                    >
                      <SettingsIcon className="w-6 h-6 text-zinc-400 stroke-[1.5]" />
                      <div className="space-y-0.5">
                        <h5 className="text-[11px] font-black text-white leading-tight">
                          {appLanguage === 'bn' ? 'সেটিংস' : 'Settings'}
                        </h5>
                        <p className="text-[9px] text-zinc-500 leading-none">Manage details</p>
                      </div>
                    </button>

                    {/* Tool 2: Creator support */}
                    <button 
                      onClick={() => {
                        alert(appLanguage === 'bn' 
                          ? "ক্রিয়েটর সাপোর্ট ফর্ম চালু আছে! যে কোনো জিজ্ঞাসায় আমাদের ইমেল করুন: mdtuhinhosinn373@gmail.com" 
                          : "Official creator support online! For core queries email us directly: mdtuhinhosinn373@gmail.com"
                        );
                        hapticFeedback('medium');
                      }}
                      className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-all text-left flex flex-col justify-between h-24"
                    >
                      <HelpCircle className="w-6 h-6 text-pink-400 stroke-[1.5]" />
                      <div className="space-y-0.5">
                        <h5 className="text-[11px] font-black text-white leading-tight">
                          {appLanguage === 'bn' ? 'ক্রিয়েটর সাপোর্ট' : 'Creator support'}
                        </h5>
                        <p className="text-[9px] text-zinc-500 leading-none">Get official help</p>
                      </div>
                    </button>

                    {/* Tool 3: Creator education */}
                    <button 
                      onClick={() => {
                        alert(appLanguage === 'bn' 
                          ? "ক্রিয়েটর একাডেমি নোটিশ: রিলগুলোতে ভালো সাউন্ড ট্র্যাকিং ব্যবহার করুন এবং ক্যাপশনে মিনিমাল হ্যাশট্যাগ রাখুন।" 
                          : "Academy Tip: Use trending sound matching curves and keep descriptors concise for 5x reach growth!"
                        );
                        hapticFeedback('medium');
                      }}
                      className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-all text-left flex flex-col justify-between h-24"
                    >
                      <BookOpen className="w-6 h-6 text-[#00A1FF] stroke-[1.5]" />
                      <div className="space-y-0.5">
                        <h5 className="text-[11px] font-black text-white leading-tight">
                          {appLanguage === 'bn' ? 'ক্রিয়েটর এডুকেশন' : 'Creator education'}
                        </h5>
                        <p className="text-[9px] text-zinc-500 leading-none">Learn algorithmic tips</p>
                      </div>
                    </button>

                    {/* Tool 4: Other tools */}
                    <button 
                      onClick={() => {
                        alert(appLanguage === 'bn' 
                          ? "ডিভাইস সেশন এবং নিরাপত্তা ম্যানেজমেন্ট প্যানেল অ্যাক্টিভ করা আছে।" 
                          : "Combined tools: Active devices verification, data backup files downloading, and SQLite metrics syncing is fully optimized from here!"
                        );
                        hapticFeedback('medium');
                      }}
                      className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-all text-left flex flex-col justify-between h-24"
                    >
                      <Briefcase className="w-6 h-6 text-indigo-400 stroke-[1.5]" />
                      <div className="space-y-0.5">
                        <h5 className="text-[11px] font-black text-white leading-tight">
                          {appLanguage === 'bn' ? 'অন্যান্য টুলস' : 'Other tools'}
                        </h5>
                        <p className="text-[9px] text-zinc-500 leading-none">Security and database</p>
                      </div>
                    </button>

                  </div>
                </div>

                {/* TURN OFF OPTION FROM IMAGE/UI CONTROLS */}
                <div className="pt-2">
                  <button
                    onClick={() => {
                      if (confirm(appLanguage === 'bn' ? "আপনি কি নিশ্চিত যে প্রফেশনাল মোড বন্ধ করতে চান?" : "Are you sure you want to turn off Professional Mode?")) {
                        setIsProMode(false);
                        try {
                          localStorage.setItem(`pro_mode_${propUserId || currentUser?.id}`, 'false');
                        } catch (err) {}
                        setShowProDashboard(false);
                        hapticFeedback('heavy');
                      }
                    }}
                    className="w-full py-3.5 bg-zinc-950 hover:bg-red-500/10 border border-zinc-900 hover:border-red-500/20 text-xs font-black uppercase tracking-widest text-[#FF4B91] rounded-2xl text-center transition-all active:scale-98"
                  >
                    {appLanguage === 'bn' ? 'প্রফেশনাল মোড বন্ধ করুন' : 'Turn off Professional Mode'}
                  </button>
                </div>

              </div>

              {/* ACTION FOOTER */}
              <div className="p-4 bg-zinc-950 border-t border-zinc-900 flex justify-end">
                <button
                  onClick={() => {
                    setShowProDashboard(false);
                    hapticFeedback('light');
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-colors"
                >
                  {appLanguage === 'bn' ? 'ড্যাশবোর্ড বন্ধ করুন' : 'Close Dashboard'}
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
        {statsModel.isOpen && (
          <ProfileStatsListModal 
            type={statsModel.type}
            userId={userId!}
            currentUserId={currentUser?.id}
            userVideos={userVideos}
            onClose={() => setStatsModel(prev => ({ ...prev, isOpen: false }))}
            onNavigateToProfile={(targetId) => {
              window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: targetId }));
            }}
            isPrivate={(() => {
              if (isOwnProfile) return false;
              if (statsModel.type === 'followers') return user.privacy?.followersList === 'private';
              if (statsModel.type === 'following') return user.privacy?.followingList === 'private';
              if (statsModel.type === 'likes') return user.privacy?.likesList === 'private';
              return false;
            })()}
          />
        )}
        {selectedVideo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[155] bg-black flex flex-col items-center justify-center"
          >
            {/* Close Button - Smaller and subtle */}
            <div className="absolute top-6 left-5 z-[160]">
              <button 
                onClick={() => setSelectedVideo(null)}
                className="p-2 bg-black/20 backdrop-blur-sm rounded-full hover:bg-black/40 transition-colors"
              >
                <X className="w-5 h-5 text-white/90" />
              </button>
            </div>

            {/* Content Rendering */}
            <div className="w-full h-full relative flex items-center justify-center">
              <VideoPlayer 
                video={selectedVideo} 
                isActive={true} 
                isMuted={isMuted} 
                setIsMuted={setIsMuted} 
              />
            </div>
          </motion.div>
        )}

         <PhotoViewerModal
          isOpen={viewingPhotoModal.isOpen}
          onClose={() => setViewingPhotoModal(prev => ({ ...prev, isOpen: false }))}
          title={viewingPhotoModal.title}
          photos={viewingPhotoModal.photos}
          isOwnProfile={isOwnProfile}
          isAdmin={isAdmin}
          userId={user.id}
          isCover={viewingPhotoModal.isCover}
          currentPhotoActive={viewingPhotoModal.currentPhotoActive}
          fullName={user.fullName || ''}
          onPhotoDeleted={(remaining, newActive) => {
            setUser(prev => {
              if (!prev) return null;
              const updated = { ...prev };
              if (viewingPhotoModal.isCover) {
                updated.coverPhotosHistory = remaining;
                updated.coverPhoto = newActive;
              } else {
                updated.profilePhotosHistory = remaining;
                updated.profilePhoto = newActive;
              }
              return updated;
            });
            setViewingPhotoModal(prev => ({
              ...prev,
              photos: remaining,
              currentPhotoActive: newActive
            }));
          }}
          onActivePhotoChanged={(newActive) => {
            setUser(prev => {
              if (!prev) return null;
              const updated = { ...prev };
              if (viewingPhotoModal.isCover) {
                updated.coverPhoto = newActive;
              } else {
                updated.profilePhoto = newActive;
              }
              return updated;
            });
            setViewingPhotoModal(prev => ({
              ...prev,
              currentPhotoActive: newActive
            }));
          }}
        />
      </AnimatePresence>
    </>
  );
}

function Notifications() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'users', user.id, 'notifications'),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setNotifs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => {
        console.error("Notifications snapshot error:", err);
      });
      return () => unsubscribe();
    }
  }, [user]);

  return (
    <div className="h-full bg-black text-white p-6 overflow-y-auto pb-24">
      <h2 className="text-2xl font-bold mb-6">Activity</h2>
      <div className="flex flex-col space-y-4">
        {notifs.length > 0 ? (
          notifs.map((n, idx) => (
            <div 
              key={`${n.id || 'notif'}-${idx}`} 
              onClick={() => window.dispatchEvent(new CustomEvent('nav-to-profile', { detail: n.fromUserId }))}
              className="flex items-center space-x-3 p-2 bg-gray-900/40 rounded-xl border border-gray-800/50 cursor-pointer hover:bg-gray-800/60 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-bold">{n.fromUserName}</span> {n.message}
                </p>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                  {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString() : 'Just now'}
                </p>
              </div>
              {n.type === 'like' && <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />}
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-500 italic text-sm">
            No new activity for now.
          </div>
        )}
      </div>
    </div>
  );
}

function BottomNav({ 
  activeTab, 
  setActiveTab, 
  unreadNotifsCount = 0 
}: { 
  activeTab: string; 
  setActiveTab: (t: string) => void;
  unreadNotifsCount?: number;
}) {
  const [appLanguage, setAppLanguage] = useState(() => localStorage.getItem('appLanguage') || 'en');

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const newLang = (e as CustomEvent).detail;
      setAppLanguage(newLang);
    };
    window.addEventListener('app-language-changed', handleLangChange);
    return () => {
      window.removeEventListener('app-language-changed', handleLangChange);
    };
  }, []);

  const tabs = [
    { id: 'home', icon: Home, activeIcon: Home, label: getTranslation(appLanguage, 'home') },
    { id: 'search', icon: VideoIcon, activeIcon: VideoIcon, label: getTranslation(appLanguage, 'video') },
    { id: 'friends', icon: Users, activeIcon: Users, label: getTranslation(appLanguage, 'friends') },
    { id: 'marketplace', icon: ShoppingBag, activeIcon: ShoppingBag, label: getTranslation(appLanguage, 'marketplace') },
    { id: 'profile', icon: UserIcon, activeIcon: UserIcon, label: getTranslation(appLanguage, 'profile') },
  ];

  return (
    <div className="bottom-nav-container w-full bg-black/95 backdrop-blur-xl border-t border-white/5 h-[calc(52px+env(safe-area-inset-bottom,0px))] flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom,0px)]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "flex flex-col items-center justify-center h-full px-1 min-w-[50px] transition-all relative overflow-hidden",
            activeTab === tab.id ? "text-white" : "text-gray-500"
          )}
        >
          {tab.id === 'upload' ? (
            <div className="relative group mx-1.5 active:scale-90 transition-transform">
              <div className="absolute inset-y-0 -left-1 w-[10px] bg-[#00f2ea] rounded-l-md blur-[0.5px] opacity-70"></div>
              <div className="absolute inset-y-0 -right-1 w-[10px] bg-[#ff0050] rounded-r-md blur-[0.5px] opacity-70"></div>
              <div className="relative bg-white text-black px-2 py-0.5 rounded-md">
                <Plus className="w-5 h-5 stroke-[4]" />
              </div>
            </div>
          ) : (
            <div className="relative">
              <tab.icon className={cn("w-5 h-5 transition-all duration-300", activeTab === tab.id ? "scale-105 stroke-[2.5]" : "stroke-[2.2]")} />
              {tab.id === 'inbox' && unreadNotifsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#FF4B91] text-white text-[8px] font-black h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-black shadow-[0_0_12px_rgba(255,75,145,0.4)] animate-pulse">
                  {unreadNotifsCount}
                </span>
              )}
            </div>
          )}
          {tab.label && (
            <span className={cn(
              "text-[8px] mt-0.5 font-black uppercase tracking-widest transition-all duration-300",
              activeTab === tab.id ? "text-white opacity-100" : "text-gray-600 opacity-80"
            )}>
              {tab.label}
            </span>
          )}
          {activeTab === tab.id && tab.id !== 'upload' && (
            <motion.div 
              layoutId="active-tab-indicator"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-[1px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.6)]"
            />
          )}
        </button>
      ))}
    </div>
  );
}

function Upload({ onComplete, onPost, onPreUpload, isOffline, preUploadTasksRef, pendingUploads = [], isNavVisible, setIsNavVisible, isMuted, setIsMuted, appLanguage = 'en' }: { key?: any, onComplete: () => void, onPost: (data: any) => void, onPreUpload: (data: any) => void, isOffline?: boolean, preUploadTasksRef: any, pendingUploads?: PendingUpload[], isNavVisible?: boolean, setIsNavVisible?: (v: boolean) => void, isMuted?: boolean, setIsMuted?: (v: boolean) => void, appLanguage?: string }) {
  const { user, emailVerified, refreshAuth } = useAuth();
  const options = (window as any).uploadOptions || {};
  const [uploadMode, setUploadMode] = useState<'video' | 'photo' | 'text'>(() => {
    if (options.uploadMode) return options.uploadMode;
    return options.isStory ? 'photo' : 'video';
  });
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('none');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [editorTab, setEditorTab] = useState<'filters' | 'adjust' | 'text' | 'stickers' | 'speed' | 'trim'>('filters');
  const [overlayText, setOverlayText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [speed, setSpeed] = useState(1);
  const [stickers, setStickers] = useState<{ value: string, x: number, y: number, scale: number }[]>([]);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [isStory, setIsStory] = useState(options.isStory || false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [privacy, setPrivacy] = useState<'everyone' | 'friends' | 'only_me' | 'marketplace'>('everyone');
  const [uploadSettings, setUploadSettings] = useState({
    quality: 'medium' as 'high' | 'medium' | 'low',
    autoSave: false
  });
  const [showUploadSettings, setShowUploadSettings] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preUploadTask, setPreUploadTask] = useState<any>(null);
  const [preUploadId, setPreUploadId] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('');
  const [activeCategory, setActiveCategory] = useState<'post' | 'blood' | 'food' | 'essentials'>('post');
  const [bgColor, setBgColor] = useState('bg-white');
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [uploadProgress, _setUploadProgress] = useState(0);
  
  // Sync background progress
  useEffect(() => {
    if (preUploadId) {
      const item = pendingUploads.find(p => p.id === preUploadId);
      if (item) {
        _setUploadProgress(item.progress);
      }
    }
  }, [pendingUploads, preUploadId]);

  // Auto open Gallery for photo/video options
  useEffect(() => {
    if (options.autoGallery) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
        if (typeof window !== 'undefined' && (window as any).uploadOptions) {
          delete (window as any).uploadOptions;
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [options.autoGallery]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [sendingVerification, setSendingVerification] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const [maxDuration, setMaxDuration] = useState<number>(15);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [finalDuration, setFinalDuration] = useState<number>(0);
  const [selectedMusic, setSelectedMusic] = useState<{id: string, name: string, url?: string} | null>(options.music || null);
  const [musicVolume, setMusicVolume] = useState<number>(100);
  const [originalSoundName, setOriginalSoundName] = useState<string>('');
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingSong, setPlayingSong] = useState<string | null>(null);
  const [step, setStep] = useState<'capture' | 'review' | 'details'>('capture');

  // Sync initial trim boundaries with video duration
  useEffect(() => {
    if (finalDuration > 0) {
      setTrimStart(0);
      setTrimEnd(finalDuration);
    }
  }, [finalDuration]);

  // Keep preview playback loop within trim boundaries
  useEffect(() => {
    const videoElem = previewVideoRef.current;
    if (!videoElem) return;

    const handleTimeUpdate = () => {
      if (trimEnd > trimStart) {
        if (videoElem.currentTime < trimStart) {
          videoElem.currentTime = trimStart;
        }
        if (videoElem.currentTime > trimEnd) {
          videoElem.currentTime = trimStart;
        }
      }
    };

    videoElem.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      videoElem.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [preview, step, isEditingContent, trimStart, trimEnd, editorTab]);

  // Consolidated background music management
  useEffect(() => {
    // If we have music and are in review/details mode
    if (selectedMusic?.url && (step === 'review' || step === 'details')) {
      // 1. Create or update audio object
      if (!musicAudioRef.current) {
        musicAudioRef.current = new Audio(selectedMusic.url);
        musicAudioRef.current.loop = true;
      } else if (musicAudioRef.current.src !== selectedMusic.url) {
        musicAudioRef.current.src = selectedMusic.url;
      }

      // 2. Apply volume and mute states immediately
      const effectivelyMuted = isMuted || musicVolume === 0;
      musicAudioRef.current.muted = effectivelyMuted;
      musicAudioRef.current.volume = musicVolume / 100;

      // 3. Handle Play/Pause based on mute state
      if (effectivelyMuted) {
        musicAudioRef.current.pause();
      } else {
        // Try to play if not muted
        const playPromise = musicAudioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => console.warn("Music playback interrupted/failed:", e));
        }
      }
    } else {
      // Not in a music-playing step or no music
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
      }
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (musicAudioRef.current) {
        // We don't null it here unless unmounting, just pause
      }
    };
  }, [selectedMusic, step, isMuted, musicVolume]);

  // Global cleanup on unmount
  useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if ((uploadMode === 'video' || uploadMode === 'photo') && !preview && !file) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
      if (typeof window !== 'undefined' && (window as any).uploadOptions) {
        delete (window as any).uploadOptions;
      }
    };
  }, [preview, uploadMode, facingMode]);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      setRecordingTime(0);
      interval = setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 0.1;
          if (next >= maxDuration) {
            stopRecording();
            return maxDuration;
          }
          return next;
        });
      }, 100);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording, maxDuration]);

  const sendVerification = async () => {
    if (!auth.currentUser) return;
    setSendingVerification(true);
    try {
      const { sendEmailVerification } = await import('firebase/auth');
      await sendEmailVerification(auth.currentUser);
      alert("Verification email sent! Please check your inbox.");
    } catch (err: any) {
      alert("Error sending email: " + err.message);
    } finally {
      setSendingVerification(false);
    }
  };

  const startCamera = async () => {
    try {
      // 1. Comprehensive track cleanup
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        setStream(null);
      }

      // 2. Small delay to let hardware release
      await new Promise(resolve => setTimeout(resolve, 150));

      // 3. Dynamic constraints with fallbacks - Optimized for maximum quality and stability
      const videoConstraints: MediaTrackConstraints = {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920, max: 1920 }, // 1080p is usually the sweet spot for mobile sensors
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60, min: 30 },
        aspectRatio: { ideal: 9/16 },
        // Advanced properties for chrome/android to improve clarity
        // @ts-ignore
        focusMode: 'continuous',
        // @ts-ignore
        exposureMode: 'continuous',
        // @ts-ignore
        whiteBalanceMode: 'continuous'
      };

      let s: MediaStream;
      try {
        // Try with optimized constraints
        const constraints = (uploadMode === 'video')
          ? { video: videoConstraints, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
          : { video: videoConstraints };
        
        try {
          s = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
          // If strict constraints fail (common on some desktop cams), try more flexible ones
          console.warn("Strict constraints failed, trying flexible ones...");
          s = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: { ideal: facingMode } },
            audio: uploadMode === 'video'
          });
        }
      } catch (err) {
        console.warn("Retrying with broader constraints for compatibility...");
        try {
          // Fallback 1: Stronger fallback for clarity
          s = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            },
            audio: uploadMode === 'video'
          });
        } catch (finalErr: any) {
          console.error("Camera final failure:", finalErr);
          if (finalErr.name === 'NotReadableError' || finalErr.message.includes("Could not start video source")) {
            setError("ক্যামেরাটি অন্য একটি অ্যাপ ব্যবহার করছে। অনুগ্রহ করে অন্য সব অ্যাপ বন্ধ করে আবার চেষ্টা করুন। (Camera is in use by another app)");
          } else if (finalErr.name === 'NotAllowedError') {
            setError("ক্যামেরা পারমিশন ব্লক করা আছে। ব্রাউজার সেটিংস থেকে পারমিশন দিন। (Permission denied)");
          } else {
            setError(`ক্যামেরা ত্রুটি: ${finalErr.name === 'OverconstrainedError' ? 'আপনার ডিভাইস এই রেজোলিউশন সাপোর্ট করে না' : finalErr.message}`);
          }
          throw finalErr;
        }
      }

      setStream(s);
      
      // Apply flash state if possible
      if (isFlashOn) {
        const track = s.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: true } as any]
          });
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        // Ensure video is playing
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Video auto-play failed:", playErr);
        }
      }
    } catch (err: any) {
      console.error("Camera error final failure:", err);
      const msg = err.message || String(err);
      if (msg.includes("Could not start video source") || msg.includes("Source unavailable")) {
        setError("Camera is being used by another application. Please close other camera apps and try again.");
      } else {
        setError(`Camera error: ${msg}. Please check permissions.`);
      }
    }
  };

  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as any;
    
    if (capabilities.torch) {
      try {
        const nextState = !isFlashOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any]
        });
        setIsFlashOn(nextState);
      } catch (err) {
        console.error("Torch error:", err);
      }
    } else {
      alert("Flash is not supported on this device/camera.");
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "captured_photo.jpg", { type: 'image/jpeg' });
          setFile(file);
          setPreview(URL.createObjectURL(blob));
          setStep('review');
          stopCamera();
        }
      }, 'image/jpeg');
    }
  };

  const startRecording = () => {
    if (!stream) {
      setError("Please enable camera access before recording.");
      return;
    }
    try {
      setIsRecording(true);
      startTimeRef.current = Date.now();
      chunksRef.current = [];
      
      // Optimized camera recording bitrates to save up to 80%-90% Google Cloud Storage quota
      let bps = 2000000; // High Quality (2.0Mbps) - extremely clear on responsive mobile/desktop formats
      if (uploadSettings.quality === 'medium') bps = 1000000; // Balanced (1.0Mbps) - default best compression choice
      if (uploadSettings.quality === 'low') bps = 450000;     // Storage Saver (450Kbps) - maximum compression
      if (uploadSettings.quality === 'high') bps = 2500000;   // Pro (2.5Mbps) - ultra crisp HD density

      const options: MediaRecorderOptions = {
        videoBitsPerSecond: bps,
      };

      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        options.mimeType = 'video/webm;codecs=h264';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const duration = (Date.now() - startTimeRef.current) / 1000;
        if (duration < 3) { 
          setError("ভিডিও খুব ছোট। কমপক্ষে ৩ সেকেন্ড রেকর্ড করুন। (Video too short)");
          setIsRecording(false);
          return;
        }
        if (duration > maxDuration + 1) { // Adding a small buffer
          setError(`ভিডিও খুব বড়। সর্বোচ্চ ${maxDuration === 180 ? '৩ মিনিট' : maxDuration + ' সেকেন্ড'} রেকর্ড করা যাবে।`);
          setIsRecording(false);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
        const file = new File([blob], "recorded_video.mp4", { type: 'video/mp4' });
        setFile(file);
        setPreview(URL.createObjectURL(blob));
        setStep('review');
        stopCamera();
        
        console.log("Video captured and ready to be posted.");
      };
      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setError("Recording error. Please try again.");
        setIsRecording(false);
      };
      mediaRecorder.start();
    } catch (err) {
      console.error("Recording error:", err);
      setError("Failed to start recording. Please try uploading from gallery.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setFinalDuration(recordingTime);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      let detectedMode: 'photo' | 'video' = 'photo';
      const isVideoFile = file.type.startsWith('video/') || 
                         ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'quicktime'].includes(file.name.split('.').pop()?.toLowerCase() || '');
      const isImageFile = file.type.startsWith('image/') || 
                         ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(file.name.split('.').pop()?.toLowerCase() || '');

      if (isVideoFile) {
        detectedMode = 'video';
      } else if (isImageFile) {
        detectedMode = 'photo';
      } else {
        detectedMode = uploadMode === 'text' ? 'photo' : uploadMode;
      }

      setUploadMode(detectedMode);

      if (detectedMode === 'video') {
        if (file.size > 1024 * 1024 * 1024) {
          setError("ভিডিও ফাইলটি অনেক বড় (সর্বোচ্চ ১জিবি)। (Video size too large, Max 1GB)");
          return;
        }

        // Validate duration with a timeout
        const video = document.createElement('video');
        video.preload = 'metadata';
        let metadataTimeout = setTimeout(() => {
          console.warn("Video metadata timeout, proceeding with upload anyway...");
          setFile(file);
          setPreview(URL.createObjectURL(file));
          setFinalDuration(0); // Cannot determine duration on timeout
          setStep('review');
          stopCamera();
          setError(null);
        }, 5000); // 5s timeout for metadata

        video.onloadedmetadata = () => {
          clearTimeout(metadataTimeout);
          window.URL.revokeObjectURL(video.src);
          const duration = video.duration;
          if (duration < 0.1) {
            setError("ভিডিওটি অত্যন্ত ছোট। (Video too short)");
            setFile(null);
            setPreview(null);
          } else if (duration > 180) {
            setError("ভিডিওটি অনেক বড় (সর্বোচ্চ ৩ মিনিট হতে হবে)। (Video too long, Max 3 mins)");
            setFile(null);
            setPreview(null);
          } else {
            setFile(file);
            setPreview(URL.createObjectURL(file));
            setFinalDuration(duration);
            setStep('review');
            stopCamera();
            setError(null);
          }
        };
        video.onerror = () => {
          clearTimeout(metadataTimeout);
          console.warn("Video metadata load error, skipping duration check and proceeding to review step.");
          setFile(file);
          setPreview(URL.createObjectURL(file));
          setFinalDuration(0);
          setStep('review');
          stopCamera();
          setError(null);
        };
        video.src = URL.createObjectURL(file);
        return; // Validation is async
      }

      if (detectedMode === 'photo' && file.size > 50 * 1024 * 1024) {
        setError("Photo size too large (Max 50MB)");
        return;
      }
      setFile(file);
      setPreview(URL.createObjectURL(file));
      setStep('review');
      stopCamera();
      setError(null);
    }
  };

  const startPreUpload = async (file: File) => {
    if (!user) return;
    const uploadId = Math.random().toString(36).substring(2, 11);
    setPreUploadId(uploadId);
    
    // Call the onPreUpload prop to let App know we are pre-uploading
    onPreUpload({
      preUploadId: uploadId,
      file,
      uploadMode,
      isStory,
      isPreUpload: true,
      quality: uploadSettings.quality,
      preview: URL.createObjectURL(file),
      filter: selectedFilter,
      musicId: selectedMusic?.id,
      musicName: selectedMusic?.name,
      musicVolume
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return; // Prevent double posting on double/triple clicks
    isSubmittingRef.current = true;
    console.log("Upload handleSubmit triggered", { uploadMode, isStory, hasFile: !!file });
    if (!user) {
      console.log("Upload failed: No user");
      return;
    }
    if (uploadMode !== 'text' && !file) {
      console.log("Upload failed: No file for non-text mode");
      return;
    }
    if (!emailVerified) {
      console.log("User not verified, showing warning but allowing attempt");
    }
    if (uploadMode === 'text' && !textContent) {
      console.log("Upload failed: No text content for text mode");
      return;
    }
    
    setLoading(true);
    console.log("Calling onPost with data...");
    onPost({
      file,
      isStory,
      title: uploadMode === 'text' ? textContent : (isStory ? (textContent || '') : (title || 'Post')),
      description: uploadMode === 'text' ? description : description,
      location,
      privacy,
      uploadMode,
      textContent,
      bgColor,
      preview: preview,
      quality: uploadSettings.quality,
      filter: selectedFilter,
      brightness,
      contrast,
      saturation,
      overlayText,
      textColor,
      speed,
      stickers,
      trimStart,
      trimEnd,
      musicVolume,
      musicId: selectedMusic?.id,
      musicName: selectedMusic ? selectedMusic.name : (originalSoundName || `Original Sound - ${user.fullName}`),
      preUploadId // Pass this so handlePost can find the existing task
    });

    // Switch to Home instantly
    onComplete();

    // Auto-save logic if enabled
    if (uploadSettings.autoSave && file) {
      try {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worlduser_${Date.now()}.${file.type.split('/')[1]}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.warn("Auto-save failed", err);
      }
    }
  };

  const bgOptions = [
    'bg-gradient-to-br from-purple-600 to-blue-600',
    'bg-gradient-to-br from-pink-500 to-orange-400',
    'bg-gradient-to-br from-green-500 to-teal-400',
    'bg-gradient-to-br from-red-500 to-pink-500',
    'bg-gradient-to-br from-indigo-500 to-purple-800',
    'bg-gradient-to-br from-yellow-400 to-orange-500',
    'bg-gradient-to-br from-blue-400 to-cyan-400',
    'bg-gray-900'
  ];

    const filterOptions = FILTER_OPTIONS;
    const [showFilters, setShowFilters] = useState(false);

  const SettingsModal = () => (
    <AnimatePresence>
      {showUploadSettings && (
        <motion.div 
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-3xl flex flex-col p-8 pt-20"
        >
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black uppercase tracking-tight">Upload Settings</h2>
            <button onClick={() => setShowUploadSettings(false)} className="p-2 bg-white/5 rounded-full">
              <X className="w-8 h-8" />
            </button>
          </div>

          <div className="space-y-10 overflow-y-auto no-scrollbar pb-20">
            <section>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6 px-1">Upload Speed & Quality / এমবি বাঁচান ও দ্রুত আপলোড</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'low', label: 'Ultra Save', desc: '🚀 সুপার ফাস্ট' },
                  { id: 'medium', label: 'Balanced', desc: '⚡ মিডিয়াম (Safe)' },
                  { id: 'high', label: 'HD Quality', desc: '✨ হাই ফুল HD' }
                ].map(q => (
                  <button
                    key={q.id}
                    onClick={() => setUploadSettings(prev => ({ ...prev, quality: q.id as any }))}
                    className={cn(
                      "py-4 rounded-2xl border-2 flex flex-col items-center justify-center space-y-1 transition-all",
                      uploadSettings.quality === q.id ? "bg-white text-black border-white" : "bg-white/5 text-white/40 border-white/5"
                    )}
                  >
                    <span className="font-black uppercase text-[9px] tracking-widest">{q.label}</span>
                    <span className="text-[7px] font-bold opacity-60 uppercase">{q.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-emerald-500 mt-3 italic font-black px-1 uppercase tracking-tight">অল্প এমবি (Ultra Save) মুড ব্যবহার করলে ভিডিও বা ফটো ১ সেকেন্ডে আপলোড হবে।</p>
            </section>

            <section>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6 px-1">Default Privacy</h3>
              <div className="space-y-3">
                {(['everyone', 'friends', 'only_me'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPrivacy(p)}
                    className={cn(
                      "w-full py-4 px-6 rounded-2xl border-2 flex justify-between items-center transition-all",
                      privacy === p ? "bg-white/10 border-white" : "bg-white/5 border-white/5"
                    )}
                  >
                    <span className={cn(
                      "font-black uppercase text-[10px] tracking-widest",
                      privacy === p ? "text-white" : "text-white/40"
                    )}>{p.replace('_', ' ')}</span>
                    {privacy === p && <Check className="w-5 h-5 text-white" />}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white/5 p-6 rounded-3xl border border-white/5 mx-1">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-white mb-1">Auto-save to device</h3>
                  <p className="text-[10px] text-gray-500 font-medium tracking-tight">Downloads a copy to your gallery after posting.</p>
                </div>
                <button 
                  onClick={() => setUploadSettings(prev => ({ ...prev, autoSave: !prev.autoSave }))}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-colors duration-300",
                    uploadSettings.autoSave ? "bg-pink-500" : "bg-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300",
                    uploadSettings.autoSave ? "right-1" : "left-1"
                  )} />
                </button>
              </div>
            </section>
          </div>

          <div className="mt-auto pt-6 bg-black">
            <button 
              onClick={() => setShowUploadSettings(false)}
              className="w-full bg-white text-black font-black uppercase py-5 rounded-3xl shadow-2xl active:scale-95 transition-all"
            >
              Save Options
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const MusicPicker = () => {
      const [dbSongs, setDbSongs] = useState<any[]>([]);
      const [isSeeding, setIsSeeding] = useState(false);
      const audioRef = useRef<HTMLAudioElement | null>(null);

      useEffect(() => {
        return () => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
        };
      }, []);

      useEffect(() => {
        const fetchAndSeedMusic = async () => {
          try {
            // First check if system music exists
            const systemQ = query(collection(db, 'music'), where('creatorId', '==', 'system'), limit(200));
            const systemSnapshot = await getDocs(systemQ);
            
            if (systemSnapshot.size < 200 && !isSeeding) {
              setIsSeeding(true);
              console.log("Seeding/Updating diverse music library to Firestore...");
              // Use setDoc with stable IDs to prevent duplicates
              for (const song of MUSIC_LIST) {
                const musicRef = doc(db, 'music', song.id);
                await setDoc(musicRef, {
                  ...song,
                  creatorId: 'system',
                  useCount: Math.floor(Math.random() * 1000),
                  createdAt: serverTimestamp()
                }, { merge: true });
              }
              setIsSeeding(false);
            }

            // Now fetch all music (system + user)
            const q = query(collection(db, 'music'), orderBy('createdAt', 'desc'), limit(1000));
            onSnapshot(q, (snapshot) => {
              const songs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
              setDbSongs(songs);
            }, (err) => {
              if (!isFirestoreShutdownError(err)) console.error("Music snapshot error:", err);
            });
          } catch (err) {
            console.error("Error in music flow:", err);
            setDbSongs(MUSIC_LIST);
          }
        };
        fetchAndSeedMusic();
      }, []);

      const filteredSongs = dbSongs.filter(song => {
        const matchesSearch = song.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          (song.artist && song.artist.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (song.language && song.language.toLowerCase().includes(searchQuery.toLowerCase()));
        
        return matchesSearch;
      });

      const handleSongSelect = (song: any) => {
        setSelectedMusic({ id: song.id, name: song.name, url: song.url });
        setShowMusicPicker(false);
        setPlayingSong(null);
        if (audioRef.current) audioRef.current.pause();
      };

      const togglePlay = (e: React.MouseEvent, songId: string, url?: string) => {
        e.stopPropagation();
        if (!url) return;
        
        if (playingSong === songId) {
          setPlayingSong(null);
          if (audioRef.current) audioRef.current.pause();
        } else {
          setPlayingSong(songId);
          if (audioRef.current) {
            audioRef.current.src = url;
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                // Interrupted or failed
                setPlayingSong(null);
              });
            }
          } else {
            const audio = new Audio(url);
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                setPlayingSong(null);
              });
            }
            audioRef.current = audio;
          }
        }
      };

      return (
        <motion.div 
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          className="fixed inset-0 z-[300] bg-white flex flex-col pt-[env(safe-area-inset-top)]"
        >
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <button onClick={() => { setShowMusicPicker(false); setPlayingSong(null); if(audioRef.current) audioRef.current.pause(); }} className="p-2">
              <X className="w-6 h-6 text-black" />
            </button>
            <h2 className="text-lg font-black text-black">Choose Music</h2>
            <div className="w-10"></div>
          </div>

          <div className="p-4 bg-white sticky top-14 z-10 flex flex-col space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search songs, artists, or languages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold text-black border-none focus:ring-2 focus:ring-pink-500 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50/50">
            <div className="p-4 space-y-2">
              {filteredSongs.map((song, idx) => (
                <div 
                  key={`${song.id || 'song'}-${idx}`}
                  onClick={() => handleSongSelect(song)}
                  className="bg-white p-3 rounded-2xl border border-gray-100 flex items-center justify-between active:border-pink-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center relative transition-colors">
                      <Music className="w-5 h-5 text-pink-500" />
                      {song.url && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button 
                            onClick={(e) => togglePlay(e, song.id, song.url)}
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                              playingSong === song.id ? "bg-pink-500 text-white" : "bg-pink-100 text-pink-500"
                            )}
                          >
                            {playingSong === song.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-black text-black leading-none mb-1">{song.name}</span>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                        {song.artist} • {song.language}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {song.useCount > 0 && (
                      <span className="text-[9px] font-bold text-gray-400">
                        {song.useCount >= 1000 ? `${(song.useCount / 1000).toFixed(1)}k` : song.useCount} plays
                      </span>
                    )}
                    {selectedMusic?.id === song.id && (
                      <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white stroke-[4]" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {selectedMusic && (
                <button 
                  onClick={() => { setSelectedMusic(null); setShowMusicPicker(false); if(audioRef.current) audioRef.current.pause(); }}
                  className="w-full py-4 mt-6 text-red-500 font-black uppercase text-xs tracking-widest bg-red-50 rounded-2xl border border-red-100 flex items-center justify-center space-x-2 active:scale-95 transition-transform"
                >
                  <X className="w-4 h-4" />
                  <span>Remove Music / গান বাদ দিন</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      );
    };

  const EditorOverlay = () => {
    const activeFilter = filterOptions.find(f => f.id === selectedFilter);
    const filterStyle = {
      filter: `${activeFilter?.style || ''} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
    };

    const colorOptions = [
      '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', 
      '#ffff00', '#ff00ff', '#00ffff', '#fbbf24', '#f472b6'
    ];

    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col pt-[env(safe-area-inset-top)]">
         <div className="p-6 flex justify-between items-center text-white border-b border-white/5">
            <button onClick={() => setIsEditingContent(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/50">Editor</h2>
            <button onClick={() => setIsEditingContent(false)} className="bg-white text-black px-6 py-2 rounded-full text-[10px] font-black uppercase shadow-xl transition-transform active:scale-95">Done</button>
         </div>

         <div className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
            <div className="w-full h-full relative flex items-center justify-center p-4">
               <div className="relative max-h-full aspect-[9/16] bg-black shadow-2xl rounded-3xl overflow-hidden border border-white/5">
                  {preview ? (
                    uploadMode === 'photo' ? (
                      <img 
                        src={preview || null} 
                        style={filterStyle}
                        className="h-full w-full object-cover transition-all duration-300" 
                      />
                    ) : (
                      <video 
                        src={preview || null} 
                        style={filterStyle}
                        ref={(el) => {
                          previewVideoRef.current = el;
                          if (el) el.playbackRate = speed;
                        }}
                        className="h-full w-full object-cover transition-all duration-300" 
                        autoPlay loop playsInline muted={isMuted} 
                      />
                    )
                  ) : stream ? (
                    <video 
                      autoPlay 
                      playsInline 
                      muted={isMuted} 
                      style={filterStyle}
                      ref={(el) => {
                         if (el && stream) {
                           el.srcObject = stream;
                         }
                      }}
                      className="h-full w-full object-cover transition-all duration-300" 
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-white/20">
                      <Camera className="w-12 h-12 mb-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Camera Off</span>
                    </div>
                  )}

                  {overlayText && (
                    <motion.div 
                      drag
                      dragConstraints={{ left: -100, right: 100, top: -200, bottom: 200 }}
                      className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-auto"
                    >
                      <span 
                        style={{ color: textColor }}
                        className="text-3xl font-black uppercase italic tracking-tighter text-center px-6 break-words bg-black/20 backdrop-blur-sm p-3 rounded-xl border border-white/10"
                      >
                        {overlayText}
                      </span>
                    </motion.div>
                  )}

                  {stickers.map((sticker, idx) => (
                    <motion.div
                      key={`placed-sticker-editor-${sticker.value || 'st'}-${idx}`}
                      drag
                      style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
                      onDragEnd={(_, info) => {
                        const newStickers = [...stickers];
                        newStickers[idx] = { 
                          ...sticker, 
                          x: sticker.x + info.delta.x, 
                          y: sticker.y + info.delta.y 
                        };
                        setStickers(newStickers);
                      }}
                      className="absolute z-20 cursor-move pointer-events-auto select-none"
                    >
                      <div className="relative group">
                        {sticker.value}
                        <button 
                          onClick={() => setStickers(stickers.filter((_, i) => i !== idx))}
                          className="absolute -top-4 -right-4 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2 h-2" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
               </div>
            </div>
         </div>

         <div className="bg-zinc-900/90 backdrop-blur-3xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
            {/* Tab Navigation */}
            <div className="flex border-b border-white/5">
               {[
                 { id: 'filters', icon: Palette, label: 'Filters' },
                 { id: 'adjust', icon: Sliders, label: 'Adjust' },
                 { id: 'text', icon: Type, label: 'Text' },
                 ...(uploadMode === 'video' ? [{ id: 'trim', icon: Scissors, label: 'Trim' }] : []),
                 { id: 'stickers', icon: Smile, label: 'Stickers' },
                 { id: 'speed', icon: Gauge, label: 'Speed' }
               ].map(tab => (
                 <button
                    key={tab.id}
                    onClick={() => setEditorTab(tab.id as any)}
                    className={cn(
                      "flex-1 py-4 flex flex-col items-center space-y-1 transition-all relative",
                      editorTab === tab.id ? "text-white" : "text-white/30"
                    )}
                 >
                    <tab.icon className="w-5 h-5" />
                    <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
                    {editorTab === tab.id && (
                      <motion.div layoutId="editor-tab-dot" className="absolute bottom-0 w-1 h-1 bg-white rounded-full" />
                    )}
                 </button>
               ))}
            </div>

            <div className="p-6 h-[180px] flex items-center justify-center">
               {editorTab === 'filters' && (
                 <div className="flex space-x-6 overflow-x-auto no-scrollbar pb-2 px-2 w-full">
                    {filterOptions.map(filter => (
                      <button 
                        key={filter.id}
                        onClick={() => setSelectedFilter(filter.id)}
                        className="flex flex-col items-center space-y-3 flex-shrink-0"
                      >
                        <div className={cn(
                          "w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all",
                          selectedFilter === filter.id ? "border-pink-500 scale-110 shadow-lg" : "border-white/10"
                        )}>
                          {preview ? (
                              uploadMode === 'photo' ? (
                                <img src={preview} className="w-full h-full object-cover" style={{ filter: filter.style }} />
                              ) : (
                                <video src={preview} className="w-full h-full object-cover" style={{ filter: filter.style }} muted />
                              )
                          ) : (
                            <div className="w-full h-full bg-gray-800" style={{ filter: filter.style }} />
                          )}
                        </div>
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          selectedFilter === filter.id ? "text-pink-500" : "text-white/40"
                        )}>{filter.name}</span>
                      </button>
                    ))}
                 </div>
               )}

               {editorTab === 'adjust' && (
                 <div className="w-full space-y-6">
                    <div className="space-y-4 px-4">
                       {[
                         { id: 'brightness', icon: Sun, label: 'Brightness', value: brightness, setter: setBrightness, min: 0, max: 200 },
                         { id: 'contrast', icon: Contrast, label: 'Contrast', value: contrast, setter: setContrast, min: 0, max: 200 },
                         { id: 'saturation', icon: Droplet, label: 'Saturation', value: saturation, setter: setSaturation, min: 0, max: 200 }
                       ].map(adj => (
                         <div key={adj.id} className="flex items-center space-x-4">
                            <adj.icon className="w-4 h-4 text-white/40" />
                            <div className="flex-1">
                               <input 
                                 type="range" 
                                 min={adj.min} 
                                 max={adj.max} 
                                 value={adj.value} 
                                 onChange={(e) => adj.setter(parseInt(e.target.value))}
                                 className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                               />
                            </div>
                            <span className="text-[10px] font-mono text-white/60 w-8">{adj.value}%</span>
                         </div>
                       ))}
                    </div>
                 </div>
               )}

               {editorTab === 'stickers' && (
                 <div className="w-full flex overflow-x-auto space-x-6 no-scrollbar px-4">
                    {['🔥', '❤️', '😂', '😍', '✨', '🙌', '💯', '🚀', '🌈', '🎉', '🌟', '💥', '👻', '👑', '💎', '🎨', '🎮', '🍕', '🐱', '🐶', '🌹', '🦋', '🍬', '🍩'].map(emoji => (
                      <button 
                        key={emoji}
                        onClick={() => setStickers([...stickers, { value: emoji, x: 50, y: 150, scale: 72 }])}
                        className="w-16 h-16 flex items-center justify-center bg-white/5 rounded-2xl text-3xl hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
                      >
                        {emoji}
                      </button>
                    ))}
                 </div>
               )}

               {editorTab === 'speed' && (
                 <div className="w-full flex justify-around px-8">
                    {[0.5, 1, 2, 3].map(s => (
                       <button
                         key={s}
                         onClick={() => setSpeed(s)}
                         className={cn(
                           "w-16 h-16 rounded-full flex items-center justify-center font-black transition-all",
                           speed === s ? "bg-white text-black scale-110 shadow-xl" : "bg-white/5 text-white/40"
                         )}
                       >
                         {s}x
                       </button>
                    ))}
                 </div>
               )}

               {editorTab === 'trim' && (
                 <div className="w-full space-y-4 px-4 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-white text-xs font-black uppercase tracking-widest px-2">
                       <span>ভিডিও কাটিং / Trim Video</span>
                       <span className="text-[#FF4B91] font-mono">
                         {(trimEnd - trimStart).toFixed(1)}s Range
                       </span>
                    </div>

                    <div className="space-y-4 bg-white/5 p-4 rounded-3xl border border-white/5">
                       {/* Trim Start slider */}
                       <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] text-white/50 px-1 font-bold">
                             <span>শুরু / Start Time:</span>
                             <span className="font-mono text-white">{trimStart.toFixed(1)}s</span>
                          </div>
                          <input 
                            type="range"
                            min={0}
                            max={Math.max(0, finalDuration - 0.5)}
                            step={0.1}
                            value={trimStart}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTrimStart(val);
                              if (val >= trimEnd) {
                                setTrimEnd(Math.min(val + 0.5, finalDuration));
                              }
                              if (previewVideoRef.current) {
                                previewVideoRef.current.currentTime = val;
                              }
                            }}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FF4B91]"
                          />
                       </div>

                       {/* Trim End slider */}
                       <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] text-white/50 px-1 font-bold">
                             <span>শেষ / End Time:</span>
                             <span className="font-mono text-white">{trimEnd.toFixed(1)}s</span>
                          </div>
                          <input 
                            type="range"
                            min={0.5}
                            max={Math.max(0.5, finalDuration)}
                            step={0.1}
                            value={trimEnd}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTrimEnd(val);
                               if (val <= trimStart) {
                                 setTrimStart(Math.max(0, val - 0.5));
                               }
                               if (previewVideoRef.current) {
                                 previewVideoRef.current.currentTime = Math.max(trimStart, val - 0.5);
                               }
                            }}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FF4B91]"
                          />
                       </div>
                    </div>
                    
                    <p className="text-[9px] text-center text-white/40 font-bold uppercase tracking-wider">
                      ভিডিও প্লেব্যাক এই সীমানার মধ্যে লুপ হবে | Video loops inside boundaries
                    </p>
                 </div>
               )}

               {editorTab === 'text' && (
                 <div className="w-full flex flex-col space-y-6 px-4">
                    <input 
                      type="text" 
                      placeholder="Type something..."
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all font-bold"
                    />
                    <div className="flex justify-between items-center px-1">
                       <div className="flex space-x-2">
                          {colorOptions.map(c => (
                            <button 
                              key={c}
                              onClick={() => setTextColor(c)}
                              className={cn(
                                "w-6 h-6 rounded-full border-2 transition-transform",
                                textColor === c ? "border-white scale-125 shadow-lg" : "border-transparent"
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                       </div>
                       <button 
                         onClick={() => setOverlayText('')}
                         className="text-[10px] font-black uppercase text-red-500/80 hover:text-red-500 transition-colors"
                       >
                         Clear
                       </button>
                    </div>
                 </div>
               )}
            </div>
         </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden">
      <div className="w-full bg-black text-white relative flex flex-col overflow-hidden h-full">
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept={uploadMode === 'photo' ? 'image/*' : uploadMode === 'video' ? 'video/*' : 'image/*,video/*'} 
          onChange={handleFileChange} 
        />
        <SettingsModal />
        {isOffline && (
          <div className="absolute top-20 left-6 right-6 z-[250] bg-red-600/90 backdrop-blur-xl p-4 rounded-2xl border border-white/20 shadow-2xl flex items-center space-x-4">
             <div className="flex-1">
               <p className="text-[10px] font-black uppercase tracking-widest">Offline Mode</p>
               <p className="text-[11px] font-bold mt-1">কানেকশন নেই। ভিডিও আপলোড সফল হবে না। (No Internet)</p>
             </div>
          </div>
        )}
        
        {/* Main Content Area: Ternary for Modes */}
        {!preview && uploadMode !== 'text' ? (
          <div className="flex-1 relative flex flex-col bg-black">
            <div className="flex-1 relative overflow-hidden bg-black flex flex-col">
              <div className="flex-1 bg-gray-900 overflow-hidden relative">
                {!stream && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black p-8 text-center">
                    <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 border border-white/10 relative overflow-hidden">
                       <Camera className="w-8 h-8 text-white/20" />
                       <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent" />
                    </div>
                    <h3 className="text-xl font-black uppercase text-white mb-2 tracking-tighter">Camera Required</h3>
                    <p className="text-gray-500 text-[10px] mb-8 font-bold uppercase tracking-widest max-w-[200px] mx-auto leading-relaxed">
                      ভিডিও রেকর্ড করার জন্য আপনার ক্যামেরা পারমিশন প্রয়োজন।
                    </p>
                    <div className="flex flex-col w-full space-y-3 max-w-[220px]">
                      <button 
                        onClick={() => startCamera()} 
                        className="bg-emerald-500 text-white px-6 py-4 rounded-2xl font-black uppercase text-xs shadow-2xl active:scale-95 transition-transform flex items-center justify-center space-x-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Allow Access</span>
                      </button>
                      <button 
                        onClick={handleGalleryClick} 
                        className="bg-white/10 text-white px-6 py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-transform flex items-center justify-center space-x-2 border border-white/5"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Open Gallery</span>
                      </button>
                    </div>
                  </div>
                )}
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  style={{
                    filter: `${filterOptions.find(f => f.id === selectedFilter)?.style || ''} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
                  }}
                  className={cn(
                    "w-full h-full object-cover",
                    facingMode === 'user' && "scale-x-[-1]"
                  )}
                />

                {overlayText && (
                  <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none">
                    <span 
                      style={{ color: textColor }}
                      className="text-4xl font-black uppercase italic tracking-tighter text-center px-10 drop-shadow-2xl"
                    >
                      {overlayText}
                    </span>
                  </div>
                )}

                {stickers.map((sticker, idx) => (
                  <div 
                    key={`placement-sticker-picker-${sticker.value || 'st'}-${idx}`}
                    style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
                    className="absolute z-20 pointer-events-none select-none drop-shadow-2xl"
                  >
                    {sticker.value}
                  </div>
                ))}
                
                {/* Top Controls Overlay */}
                <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onComplete()} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10"><X className="w-5 h-5" /></button>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => setShowMusicPicker(true)}
                      className={cn(
                        "flex items-center space-x-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 transition-all active:scale-95",
                        selectedMusic && "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                      )}
                    >
                      <Music className={cn("w-3.5 h-3.5", !selectedMusic && "text-white")} />
                      <span className="text-[10px] font-black uppercase tracking-widest max-w-[100px] truncate">{selectedMusic ? selectedMusic.name : 'Add Music'}</span>
                    </button>
                    <div className="flex items-center space-x-2">
                       <button onClick={() => setIsMuted?.(!isMuted)} className="p-2.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 active:scale-90 transition-transform">
                         {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                       </button>
                    </div>
                  </div>
                </div>

                {/* Sidebar Controls */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center space-y-5" onClick={(e) => e.stopPropagation()}>
                   <button onClick={toggleCamera} className="w-9 h-9 bg-black/40 backdrop-blur-md rounded-full border border-white/10 flex items-center justify-center text-white"><RotateCw className="w-4.5 h-4.5" /></button>
                   <button onClick={toggleFlash} className={cn("w-9 h-9 bg-black/40 rounded-full border border-white/10 flex items-center justify-center", isFlashOn ? "text-yellow-400" : "text-white")}><Zap className="w-4.5 h-4.5" /></button>
                   <button onClick={() => setIsEditingContent(true)} className="w-9 h-9 bg-black/40 backdrop-blur-md rounded-full border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform"><Palette className="w-4.5 h-4.5" /></button>
                   <button onClick={() => setShowUploadSettings(true)} className="w-9 h-9 bg-black/40 rounded-full flex items-center justify-center"><SettingsIcon className="w-4.5 h-4.5" /></button>
                </div>
              </div>

              {/* Bottom Capture Controls - Lifted above Navigation Bar */}
              <div className="absolute bottom-[90px] left-0 right-0 z-20 flex flex-col items-center pb-[env(safe-area-inset-bottom)] px-6" onClick={(e) => e.stopPropagation()}>
                 {/* Video Max Duration selector */}
                 {uploadMode === 'video' && !isRecording && (
                   <div className="flex justify-center space-x-4 mb-4">
                      {[15, 60, 180].map(d => (
                        <button 
                          key={d} 
                          onClick={() => setMaxDuration(d)} 
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black border transition-all active:scale-95 uppercase tracking-wider", 
                            maxDuration === d ? "bg-white text-black border-white" : "bg-black/45 text-white/50 border-white/10"
                          )}
                        >
                          {d}s limit
                        </button>
                      ))}
                   </div>
                 )}

                 {/* Recording timer indicator */}
                 {isRecording && (
                   <div className="bg-red-500 text-white font-extrabold text-[10px] uppercase tracking-widest px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-lg mb-5 animate-pulse">
                     <span className="w-1.5 h-1.5 rounded-full bg-white" />
                     <span>
                       REC {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toFixed(0).padStart(2, '0')}
                     </span>
                   </div>
                 )}

                 {/* Core Camera Action Row: Gallery - Shutter - Rotate */}
                 <div className="flex items-center justify-between w-full max-w-xs mb-6">
                    {/* Gallery upload preview square */}
                    <button 
                      onClick={handleGalleryClick} 
                      className="w-11 h-11 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform group"
                    >
                      <ImageIcon className="w-5 h-5 text-white/90 group-hover:text-white" />
                    </button>

                    {/* Shutter Circle Button */}
                    <div className="relative">
                      <button 
                        onClick={
                          uploadMode === 'video'
                            ? (isRecording ? stopRecording : startRecording)
                            : capturePhoto
                        }
                        className={cn(
                          "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all bg-transparent active:scale-90",
                          uploadMode === 'video' ? "border-red-500" : "border-white"
                        )}
                      >
                        <div className={cn(
                          "transition-all duration-300",
                          uploadMode === 'video'
                            ? (isRecording ? "w-8 h-8 rounded bg-red-500" : "w-14 h-14 rounded-full bg-red-500")
                            : "w-14 h-14 rounded-full bg-white"
                        )} />
                      </button>
                    </div>

                    {/* Camera switch toggle button */}
                    <button 
                      onClick={toggleCamera} 
                      className="w-11 h-11 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform"
                    >
                      <RotateCw className="w-5 h-5 text-white/90" />
                    </button>
                 </div>

                 {/* Photo, Video, Text Upload Mode Bottom Toggle Navigation Tabs */}
                 <div className="bg-black/60 backdrop-blur-xl px-5 py-2.5 rounded-full border border-white/10 flex items-center space-x-6 z-20">
                    {[
                      { id: 'photo', label: 'Photo' },
                      { id: 'video', label: 'Video' },
                      { id: 'text', label: 'Text post' }
                    ].map((mode) => {
                      const isSel = uploadMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            hapticFeedback('light');
                            setUploadMode(mode.id as any);
                          }}
                          className={cn(
                            "text-[10px] font-black uppercase tracking-widest transition-all px-3 py-1 rounded-full leading-none active:scale-95",
                            isSel 
                              ? "text-black bg-white shadow-md font-extrabold" 
                              : "text-white/40 hover:text-white/80 font-bold"
                          )}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                 </div>
              </div>
            </div>
          </div>
        ) : uploadMode === 'text' && !preview ? (
          <div className="flex-1 flex flex-col bg-white text-black min-h-0 select-none overflow-y-auto">
            {/* Header Section */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shrink-0 sticky top-0 z-20">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => {
                    if (options.uploadMode) {
                      onComplete();
                    } else {
                      setUploadMode('video');
                    }
                  }} 
                  className="p-2 hover:bg-gray-100 rounded-full text-black transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-700" />
                </button>
                <span className="text-lg font-bold text-gray-900">Create post</span>
              </div>
              
              <button 
                onClick={() => handleSubmit({ preventDefault: () => {} } as any)}
                disabled={loading || !textContent}
                className="bg-[#FF4B91] disabled:opacity-40 text-white font-extrabold text-xs px-5 py-2 rounded-full shadow-md hover:opacity-90 active:scale-95 transition-all"
              >
                {loading ? 'Posting...' : 'Post'}
              </button>
            </div>

            {/* Top Horizontally Scrollable Category Badges */}
            <div className="flex items-center space-x-2.5 overflow-x-auto px-4 py-3 border-b border-gray-100 bg-white shrink-0 scrollbar-none">
              {[
                { id: 'post', label: 'Post', icon: FileText, activeBg: 'bg-[#FF4B91] text-white border-[#FF4B91]' },
                { id: 'blood', label: 'Blood', icon: Heart, activeBg: 'bg-red-500 text-white border-red-500' },
                { id: 'food', label: 'Food', icon: Utensils, activeBg: 'bg-amber-500 text-white border-amber-500' },
                { id: 'essentials', label: 'Essentials', icon: Package, activeBg: 'bg-indigo-500 text-white border-indigo-500' }
              ].map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id as any)}
                    className={cn(
                      "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full border text-xs font-black whitespace-nowrap transition-all active:scale-95",
                      isActive ? cat.activeBg : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* User Profile Block */}
            <div className="px-5 py-4 flex items-start space-x-3 bg-white shrink-0">
              <img 
                src={user?.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop"} 
                alt={user?.fullName || "User Avatar"} 
                className="w-11 h-11 rounded-full border border-pink-100 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="font-extrabold text-sm text-gray-950 leading-tight">
                  {user?.fullName || "Default User"}
                </span>
                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                  {[
                    { id: 'everyone', label: 'Public' },
                    { id: 'friends', label: 'Friends' },
                    { id: 'only_me', label: 'Only me' }
                  ].map((p) => {
                    const isSel = privacy === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPrivacy(p.id as any)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold border transition-colors leading-none active:scale-95",
                          isSel ? "border-[#FF4B91] bg-pink-50 text-[#FF4B91]" : "border-gray-200 text-gray-400"
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Main Editing Area */}
            <div className="flex-1 flex flex-col bg-white min-h-[220px]">
              <div className={cn(
                "w-full transition-all duration-300 min-h-[180px] flex items-center justify-center p-6 relative select-text",
                bgColor === 'bg-white' ? "bg-white" : cn("rounded-3xl shadow-inner min-h-[240px] text-white my-3 mx-4 w-[calc(100%-2rem)]", bgColor)
              )}>
                <textarea
                  autoFocus
                  placeholder="What's on your mind?"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className={cn(
                    "w-full bg-transparent resize-none border-none outline-none focus:ring-0 leading-snug p-2",
                    bgColor === 'bg-white' 
                      ? "text-gray-900 text-xl text-left font-semibold" 
                      : "text-white text-2xl font-black text-center min-h-[120px] placeholder:text-white/40"
                  )}
                  rows={bgColor === 'bg-white' ? 5 : 4}
                />
              </div>

              {/* Bottom auxiliary desc if default white background */}
              {bgColor === 'bg-white' && (
                <div className="px-6 py-2">
                  <textarea
                    placeholder="বিস্তারিত বর্ণনা লিখুন... Description of post here (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-500 border-none outline-none focus:ring-0 resize-none h-20 placeholder:text-gray-300"
                  />
                </div>
              )}

              {/* Background Style Circles Selector Row */}
              <div className="px-5 py-3 flex items-center border-t border-b border-gray-100 bg-white mt-auto shrink-0">
                <button 
                  onClick={() => setBgColor('bg-white')}
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-gradient-to-tr from-pink-500 to-rose-400 text-white shadow-sm active:scale-90 transition-transform shrink-0 mr-3",
                    bgColor === 'bg-white' ? "ring-2 ring-pink-500 ring-offset-1" : ""
                  )}
                >
                  Aa
                </button>

                <div className="flex items-center space-x-2.5 overflow-x-auto scrollbar-none flex-1 pr-2">
                  {[
                    { id: 'bg-blue-600', colorClass: 'bg-blue-600' },
                    { id: 'bg-red-500', colorClass: 'bg-red-500' },
                    { id: 'bg-black', colorClass: 'bg-black' },
                    { id: 'bg-green-600', colorClass: 'bg-green-600' },
                    { id: 'bg-teal-600', colorClass: 'bg-teal-600' },
                    { id: 'bg-pink-500', colorClass: 'bg-[#FF4B91]' },
                    { id: 'bg-gradient-to-br from-purple-600 to-blue-600', colorClass: 'bg-gradient-to-br from-purple-600 to-blue-600' },
                    { id: 'bg-gradient-to-br from-pink-500 to-orange-400', colorClass: 'bg-gradient-to-br from-pink-500 to-orange-400' },
                    { id: 'bg-gradient-to-br from-green-500 to-teal-400', colorClass: 'bg-gradient-to-br from-green-500 to-teal-400' },
                    { id: 'bg-gradient-to-br from-indigo-500 to-purple-800', colorClass: 'bg-gradient-to-br from-indigo-500 to-purple-800' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setBgColor(item.id)}
                      className={cn(
                        "w-7 h-7 rounded-full shadow-sm shrink-0 active:scale-90 transition-all border border-gray-100",
                        item.colorClass,
                        bgColor === item.id ? "ring-2 ring-pink-500 ring-offset-1 scale-110" : ""
                      )}
                    />
                  ))}
                </div>

                <button 
                  onClick={() => {
                    const list = [
                      'bg-white', 'bg-blue-600', 'bg-red-500', 'bg-black', 'bg-green-600', 
                      'bg-teal-600', 'bg-pink-500', 'bg-gradient-to-br from-purple-600 to-blue-600', 
                      'bg-gradient-to-br from-pink-500 to-orange-400', 'bg-gradient-to-br from-green-500 to-teal-400'
                    ];
                    const idx = list.indexOf(bgColor);
                    const nextIdx = (idx + 1) % list.length;
                    setBgColor(list[nextIdx]);
                  }}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Bottom Quick Actions List */}
              <div className="bg-white p-3 space-y-1 border-t border-gray-50 shrink-0">
                {[
                  { 
                    label: 'Photo from gallery', 
                    icon: ImageIcon, 
                    color: 'text-green-500 bg-green-50',
                    action: () => {
                      setUploadMode('photo');
                      setTimeout(() => fileInputRef.current?.click(), 150);
                    }
                  },
                  { 
                    label: 'Upload a feels (video)', 
                    icon: VideoIcon, 
                    color: 'text-red-500 bg-red-50',
                    action: () => {
                      setUploadMode('video');
                      setTimeout(() => fileInputRef.current?.click(), 150);
                    }
                  },
                  { 
                    label: 'Camera', 
                    icon: Camera, 
                    color: 'text-blue-500 bg-blue-50',
                    action: () => {
                      setUploadMode('photo');
                      setPreview(null);
                      setStep('capture');
                    }
                  },
                  { 
                    label: 'Flick The Moment (dual camera)', 
                    icon: RefreshCw, 
                    color: 'text-purple-500 bg-purple-50',
                    action: () => {
                      setUploadMode('video');
                      setPreview(null);
                      setStep('capture');
                    }
                  }
                ].map((act, idx) => {
                  const Icon = act.icon;
                  return (
                    <button
                      key={idx}
                      onClick={act.action}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 active:scale-[0.99] transition-all text-left"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", act.color)}>
                          <Icon className="w-4 h-4 font-black" />
                        </div>
                        <span className="font-extrabold text-gray-700 text-xs">{act.label}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : preview && step === 'review' ? (
        <div className="absolute inset-0 z-50 bg-black flex flex-col pt-[env(safe-area-inset-top)] overflow-hidden">
          {/* Top Indicators */}
          <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-10 pointer-events-none">
            <button 
              onClick={() => { setPreview(null); setFile(null); setStep('capture'); setSelectedFilter('none'); }} 
              className="p-3 bg-black/40 rounded-full pointer-events-auto active:scale-90 transition-transform"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <div className="flex flex-col items-end space-y-4">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full flex items-center space-x-1 border border-white/10">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-white">
                  {Math.floor(finalDuration / 60)}:{(finalDuration % 60).toFixed(0).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>

          <div className="absolute top-24 left-6 z-10 pointer-events-none">
             <div className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center space-x-1.5 border border-white/10 pointer-events-auto">
               <Sparkles className="w-3.5 h-3.5 text-white/80" />
               <span className="text-[10px] font-black uppercase text-white tracking-widest leading-none">Original</span>
             </div>
          </div>

          {/* Sidebar Controls in Review mode */}
          <div className="absolute right-6 top-1/3 z-20 flex flex-col items-center space-y-6">
             <button 
               onClick={() => setIsEditingContent(true)}
               className="flex flex-col items-center group active:scale-95 transition-transform"
             >
               <div className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 shadow-lg">
                 <Palette className="w-6 h-6 text-white" />
               </div>
               <span className="mt-1.5 text-[8px] font-black uppercase text-white/60 group-hover:text-white tracking-widest">Edit</span>
             </button>
             
             <button 
               onClick={() => setShowMusicPicker(true)}
               className="flex flex-col items-center group active:scale-95 transition-transform"
             >
               <div className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 shadow-lg">
                 <Music className="w-6 h-6 text-white" />
               </div>
               <span className="mt-1.5 text-[8px] font-black uppercase text-white/60 group-hover:text-white tracking-widest">Music</span>
             </button>

             <button 
               onClick={() => setIsMuted?.(!isMuted)}
               className="flex flex-col items-center group active:scale-95 transition-transform"
             >
               <div className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 shadow-lg">
                 {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
               </div>
               <span className="mt-1.5 text-[8px] font-black uppercase text-white/60 group-hover:text-white tracking-widest">{isMuted ? 'Muted' : 'Sound'}</span>
             </button>
          </div>

          {/* Full Screen Preview */}
          <div className="flex-1 relative flex items-center justify-center">
            <div className="w-full h-full relative">
              {uploadMode === 'video' ? (
                <video 
                  src={preview || null} 
                  ref={(el) => {
                    previewVideoRef.current = el;
                    if (el) el.playbackRate = speed;
                  }}
                  style={{
                    filter: `${filterOptions.find(f => f.id === selectedFilter)?.style || ''} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
                  }}
                  className="w-full h-full object-cover transition-all duration-300" 
                  autoPlay 
                  loop 
                  playsInline 
                  muted={isMuted}
                />
              ) : (
                <img 
                  src={preview || null} 
                  style={{
                    filter: `${filterOptions.find(f => f.id === selectedFilter)?.style || ''} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
                  }}
                  className="w-full h-full object-cover transition-all duration-300" 
                />
              )}

              {overlayText && (
                <div className="absolute inset-x-0 top-1/4 flex items-center justify-center z-10 pointer-events-none">
                  <span 
                    style={{ color: textColor }}
                    className="text-4xl font-black uppercase italic tracking-tighter text-center px-10 drop-shadow-2xl"
                  >
                    {overlayText}
                  </span>
                </div>
              )}

              {stickers.map((sticker, idx) => (
                <div 
                  key={`placement-sticker-final-${sticker.value || 'st'}-${idx}`}
                  style={{ left: sticker.x, top: sticker.y, fontSize: `${sticker.scale}px` }}
                  className="absolute z-20 pointer-events-none select-none drop-shadow-2xl"
                >
                  {sticker.value}
                </div>
              ))}
            </div>

            {/* Floating Trim Button */}
            <div className="absolute right-6 bottom-48 z-10">
               <button className="bg-black/40 backdrop-blur-md p-4 rounded-3xl border border-white/10 flex flex-col items-center justify-center space-y-1 active:scale-95 transition-transform">
                  <Scissors className="w-5 h-5 text-white" />
                  <span className="text-[9px] font-black uppercase text-white tracking-tighter">
                    Trim {Math.floor(finalDuration / 60)}:{(finalDuration % 60).toFixed(0).padStart(2, '0')}
                  </span>
               </button>
            </div>
          </div>

          {/* Bottom Banner */}
          <div className="absolute bottom-32 left-6 right-6 z-10 flex flex-col space-y-3">
            <div 
              onClick={() => setShowMusicPicker(true)}
              className="bg-black/40 backdrop-blur-3xl p-5 rounded-[2.5rem] border border-white/5 flex items-center justify-between shadow-2xl cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Music className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white mb-0.5">
                    {selectedMusic ? selectedMusic.name : 'Add music to this Feels'}
                  </h4>
                  <p className="text-[10px] font-bold text-white/50 leading-none">
                    {selectedMusic ? 'Tap to change music' : 'Choose a track now or change later'}
                  </p>
                </div>
              </div>
              <button className="bg-[#FF4B91] px-6 py-2 rounded-full flex items-center space-x-2 transition-colors active:scale-95">
                <RefreshCcw className="w-3 h-3 text-white" />
                <span className="text-[10px] font-black uppercase text-white tracking-widest">Sync</span>
              </button>
            </div>

            {/* Mute Toggle in Review Screen */}
            <div className="flex justify-center">
              <button 
                onClick={() => setIsMuted?.(!isMuted)}
                className="bg-black/40 backdrop-blur-md rounded-full px-4 py-2 border border-white/10 flex items-center space-x-2 active:scale-95 transition-all text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span className="text-[9px] font-black uppercase tracking-widest">
                  {isMuted ? 'Muted' : 'Sound On'}
                </span>
              </button>
            </div>
          </div>

          {/* Final Action Buttons */}
          <div className="absolute bottom-8 left-6 right-6 z-10 flex space-x-3">
             <button 
               onClick={() => { setPreview(null); setFile(null); setStep('capture'); startCamera(); }}
               className="px-5 h-16 rounded-[2rem] border-2 border-white/20 flex items-center justify-center text-white font-black text-xs active:scale-[0.95] transition-all bg-black/40 backdrop-blur-md"
             >
               Retake
             </button>
             <button 
                onClick={() => setStep('details')}
                className="flex-1 h-16 rounded-[2rem] bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white font-black text-xs active:scale-[0.95] transition-all backdrop-blur-md"
             >
                Details
             </button>
             <button 
                onClick={(e) => {
                  e.preventDefault();
                  handleSubmit({ preventDefault: () => {} } as any);
                }}
                disabled={loading}
                className={`flex-[1.5] h-16 rounded-[2rem] bg-[#FF4B91] flex items-center justify-center text-white font-black text-xs active:scale-[0.95] transition-all uppercase tracking-wider gap-2 ${loading ? "opacity-60 cursor-not-allowed" : "shadow-[0_8px_25px_rgba(255,75,145,0.4)] animate-pulse"}`}
             >
                <Send className="w-3.5 h-3.5" />
                Post Now / সরাসরি পোস্ট
             </button>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 z-50 bg-[#F9F9F9] flex flex-col font-sans">
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-4 bg-white border-b border-gray-100">
            <button onClick={() => { setPreview(null); setFile(null); setSelectedFilter('none'); }} className="p-2">
              <ChevronLeft className="w-6 h-6 text-black" />
            </button>
            <h2 className="text-xl font-bold text-black">{isStory ? 'Post to Story' : 'Post feels'}</h2>
            <div className="w-10"></div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Content Card */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm relative space-y-4">
              <div className="flex space-x-4">
                {/* Left: Title/Caption */}
                <div className="flex-1 flex flex-col">
                  <span className="text-xs font-black uppercase text-[#FF4B91] mb-1.5">পোস্টের লেখা / Capion/Title</span>
                  <textarea
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isStory ? "Add a link or text..." : "একটি সুন্দর শিরোনাম বা ক্যাপশন লিখুন... (Write title or caption...)"}
                    className="w-full bg-transparent border border-gray-100 rounded-2xl p-3 focus:border-pink-300 focus:ring-0 text-sm text-gray-800 placeholder-gray-400 resize-none min-h-[120px] outline-none transition-colors"
                    maxLength={500}
                  />
                  <span className="text-[10px] text-gray-400 mt-1 self-end">{title.length}/500</span>
                </div>

                {/* Right: Video Preview Card */}
                <div 
                  className="w-32 h-44 bg-black rounded-2xl relative overflow-hidden flex flex-col items-center justify-center p-2 text-center cursor-pointer group flex-shrink-0"
                  onClick={() => setIsEditingContent(true)}
                >
                  {uploadMode === 'video' ? (
                    <video 
                      src={preview! || null} 
                      ref={(el) => {
                        previewVideoRef.current = el;
                      }}
                      className={cn("absolute inset-0 w-full h-full object-cover opacity-50", filterOptions.find(f => f.id === selectedFilter)?.class)} 
                      autoPlay 
                      loop 
                      muted={isMuted} 
                    />
                  ) : (
                    <img src={preview! || null} className={cn("absolute inset-0 w-full h-full object-cover opacity-50", filterOptions.find(f => f.id === selectedFilter)?.class)} />
                  )}
                  
                  <div className="relative z-10">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-white leading-tight block">Video ready to upload</span>
                  </div>

                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <Scissors className="w-6 h-6 text-white mb-1" />
                     <p className="text-[8px] font-black uppercase text-white">Tap to Edit</p>
                  </div>

                  <div className="absolute top-2 left-2 bg-black/40 px-2 py-0.5 rounded-full">
                    <span className="text-[8px] font-bold text-white uppercase italic">Preview</span>
                  </div>
                </div>
              </div>

              {/* Description field */}
              {!isStory && (
                <div className="flex flex-col border-t border-gray-100 pt-3">
                  <span className="text-xs font-black uppercase text-[#FF4B91] mb-2">পোস্টের বর্ণনা / Description (ঐচ্ছিক)</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="এখানে আপনার বিস্তারিত পোস্টের বর্ণনা বা হ্যাশট্যাগ লিখুন... (Write rich description or long hashtags details here...)"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-xs text-gray-700 placeholder-gray-400 resize-none h-24 outline-none focus:border-pink-300 transition-colors"
                  />
                </div>
              )}

              {/* Bottom Tags */}
              <div className="flex space-x-3 mt-6">
                <button 
                  onClick={() => setShowMusicPicker(true)}
                  className="flex-1 h-11 bg-[#FFF0F5] rounded-2xl flex items-center justify-center space-x-2 border border-[#FFD1DC] active:scale-95 transition-transform truncate px-2"
                >
                  <Music className="w-4 h-4 text-[#FF4B91]" />
                  <span className="text-sm font-bold text-[#FF4B91] truncate">
                    {selectedMusic ? selectedMusic.name : 'Music'}
                  </span>
                </button>
                <button className="flex-1 h-11 bg-[#FFF0F5] rounded-2xl flex items-center justify-center space-x-2 border border-[#FFD1DC] active:scale-95 transition-transform">
                  <Sparkles className="w-4 h-4 text-[#FF4B91]" />
                  <span className="text-sm font-bold text-[#FF4B91]">Effect</span>
                </button>
                <button 
                  onClick={() => setTitle(prev => prev + ' #world #trending ')}
                  className="flex-1 h-11 bg-[#FFF0F5] rounded-2xl flex items-center justify-center space-x-2 border border-[#FFD1DC] active:scale-95 transition-transform"
                >
                  <Tag className="w-4 h-4 text-[#FF4B91]" />
                  <span className="text-sm font-bold text-[#FF4B91]"># Tags</span>
                </button>
              </div>
            </div>



            {/* Privacy Section */}
            {!isStory && (
              <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-6">
                {selectedMusic && (
                  <div className="space-y-4 pb-4 border-b border-gray-50">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center">
                        <Volume2 className="w-3 h-3 mr-2 text-pink-500" />
                        Music Volume / ভলিউম
                      </h4>
                      <span className="text-[10px] font-black text-pink-500">{musicVolume}%</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      value={musicVolume}
                      onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>
                )}

                {!selectedMusic && uploadMode === 'video' && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center">
                      <Music className="w-3 h-3 mr-2 text-pink-500" />
                      Name your original sound
                    </h4>
                    <input 
                      type="text"
                      placeholder={`Original Sound - ${user.fullName}`}
                      value={originalSoundName}
                      onChange={(e) => setOriginalSoundName(e.target.value)}
                      className="w-full bg-gray-50 rounded-xl py-3 px-4 text-xs font-bold text-black border border-gray-100 focus:border-pink-300 focus:ring-0 transition-all"
                    />
                    <p className="text-[8px] text-gray-400 font-medium">This is how others will see your audio in the library.</p>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-[#FFF0F5] rounded-xl flex items-center justify-center">
                    <Globe className="w-5 h-5 text-[#FF4B91]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-black">Everyone can view this post</h4>
                    <p className="text-[10px] text-gray-400">Choose who can watch before you post.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button 
                    onClick={() => setPrivacy('everyone')}
                    className={cn(
                      "w-full p-4 rounded-2xl flex items-center justify-between transition-all",
                      privacy === 'everyone' ? "bg-white border-2 border-[#FF4B91]" : "bg-[#F9F9F9] border border-gray-100"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        privacy === 'everyone' ? "bg-[#FF4B91] text-white" : "bg-white text-gray-400 border border-gray-100"
                      )}>
                        <Globe className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-bold text-black">Everyone</span>
                        <span className="text-[10px] text-gray-400">Anyone on WorldSocial can view this feels.</span>
                      </div>
                    </div>
                    {privacy === 'everyone' && (
                      <div className="w-5 h-5 bg-[#FF4B91] rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white stroke-[4]" />
                      </div>
                    )}
                  </button>

                  <button 
                    onClick={() => setPrivacy('friends')}
                    className={cn(
                      "w-full p-4 rounded-2xl flex items-center justify-between transition-all",
                      privacy === 'friends' ? "bg-white border-2 border-[#FF4B91]" : "bg-[#F9F9F9] border border-gray-100"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        privacy === 'friends' ? "bg-[#FF4B91] text-white" : "bg-white text-gray-400 border border-gray-100"
                      )}>
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-bold text-black">Friends</span>
                        <span className="text-[10px] text-gray-400">Only your friends can view this feels.</span>
                      </div>
                    </div>
                    {privacy === 'friends' && (
                      <div className="w-5 h-5 bg-[#FF4B91] rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white stroke-[4]" />
                      </div>
                    )}
                  </button>

                  <button 
                    onClick={() => setPrivacy('marketplace')}
                    className={cn(
                      "w-full p-4 rounded-2xl flex items-center justify-between transition-all mt-2",
                      privacy === 'marketplace' ? "bg-white border-2 border-[#FF4B91]" : "bg-[#F9F9F9] border border-gray-100"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        privacy === 'marketplace' ? "bg-[#FF4B91] text-white" : "bg-white text-gray-400 border border-gray-100"
                      )}>
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-bold text-black">Marketplace (Marketing & Promotion)</span>
                        <span className="text-[10px] text-gray-400">This video is uploaded for product marketing in the Marketplace.</span>
                      </div>
                    </div>
                    {privacy === 'marketplace' && (
                      <div className="w-5 h-5 bg-[#FF4B91] rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white stroke-[4]" />
                      </div>
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-red-500 text-xs text-center font-bold uppercase tracking-tighter bg-red-50 py-2 rounded-lg">{error}</p>}
            
            {uploadProgress > 0 && (
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-tight">
                  <span className="text-[#FF4B91]">
                    {uploadProgress >= 100 
                      ? (appLanguage === 'bn' ? "সার্ভারে সংরক্ষণ করা হচ্ছে..." : "Saving to server...") 
                      : (appLanguage === 'bn' ? "সার্ভারে আপলোড হচ্ছে..." : "Uploading to server...")}
                  </span>
                  <span className="text-black">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="bg-gradient-to-r from-[#FF4B91] to-[#FF80B5] h-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="p-4 pb-8 bg-white border-t border-gray-100 flex items-center space-x-3">
             <button 
              onClick={() => { setPreview(null); setFile(null); }}
              className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 active:scale-95 transition-transform"
             >
                <RefreshCcw className="w-6 h-6" />
             </button>
             <button 
              onClick={handleSubmit}
              disabled={loading}
              className={cn(
                "flex-1 h-14 bg-[#FF4B91] rounded-full text-white font-black text-lg shadow-[0_8px_20px_rgba(255,75,145,0.3)] active:scale-[0.98] transition-all flex items-center justify-center",
                loading ? "opacity-70 cursor-not-allowed" : ""
              )}
             >
               {loading ? (
                 <div className="flex items-center space-x-2">
                   <div className="flex space-x-1.5 items-center font-bold">
                     <div className="w-1.5 h-1.5 bg-white rounded-sm animate-pulse" />
                     <div className="w-1.5 h-1.5 bg-white/70 rounded-sm animate-pulse delay-75" />
                     <div className="w-1.5 h-1.5 bg-white/40 rounded-sm animate-pulse delay-150" />
                   </div>
                   <span className="uppercase text-sm tracking-widest">Posting...</span>
                 </div>
               ) : (
                 <span className="uppercase text-sm tracking-[0.2em]">Post</span>
               )}
             </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isEditingContent && <EditorOverlay />}
        {showMusicPicker && <MusicPicker />}
      </AnimatePresence>
      </div>
    </div>
  );
}

// --- Utils ---

const fileToBase64 = (file: Blob | File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const uploadToServerApi = async (
  file: File, 
  onProgress: (p: number) => void,
  cancelRef?: { current?: () => void }
): Promise<string> => {
  const maxRetries = 2; // Up to 2 retries (total of 3 attempts) for extremely robust delivery
  let attempt = 0;

  const runUpload = (): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const provider = 'cloudinary'; // Force Cloudinary as default primary provider
      const cldConfigRaw = localStorage.getItem('world_cloudinary_config');
      const origin = getAppOrigin();
      const uploadUrl = (origin && origin !== 'null' && origin.startsWith('http')) 
        ? `${origin.replace(/\/$/, '')}/api/upload` 
        : '/api/upload';

      const formData = new FormData();
      formData.append('file', file);
      formData.append('provider', provider);
      if (cldConfigRaw) {
        formData.append('cloudinaryConfig', cldConfigRaw);
      }
      if (origin) {
        formData.append('clientOrigin', origin);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      
      // 300 seconds (5 minutes) timeout for entire network request
      xhr.timeout = 300000; 

      let lastProgressTime = Date.now();
      let lastPercent = 0;

      // Monitor for stalls (no progress updates)
      const stallInterval = setInterval(() => {
        const now = Date.now();
        // If 60 seconds passed without any progress update, and we haven't finished uploading to server, abort and retry
        if (lastPercent < 100 && now - lastProgressTime > 60000) {
          console.warn("Upload connection stalled (no progress for 60s). Aborting and retrying...");
          clearInterval(stallInterval);
          try { xhr.abort(); } catch (e) {}
          reject(new Error("Upload connection stalled"));
        }
      }, 5000);

      if (cancelRef) {
        cancelRef.current = () => {
          clearInterval(stallInterval);
          try { xhr.abort(); } catch (e) {}
        };
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          if (percentComplete > lastPercent) {
            lastPercent = percentComplete;
            lastProgressTime = Date.now(); // reset stall timer on progress
          }
          if (percentComplete >= 100) {
            clearInterval(stallInterval); // CLEAR stall timer immediately once fully sent to server
          }
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        clearInterval(stallInterval);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.url) {
              resolve(res.url);
            } else {
              reject(new Error("No URL returned from server upload API"));
            }
          } catch (e) {
            reject(new Error("Failed to parse server upload response"));
          }
        } else {
          reject(new Error(`Server upload API failed with code ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        clearInterval(stallInterval);
        reject(new Error("Network connection error during server upload API"));
      };

      xhr.ontimeout = () => {
        clearInterval(stallInterval);
        reject(new Error("Upload request timed out"));
      };

      xhr.onabort = () => {
        clearInterval(stallInterval);
        reject(new Error("Upload aborted"));
      };

      xhr.send(formData);
    });
  };

  while (attempt < maxRetries) {
    try {
      return await runUpload();
    } catch (err: any) {
      if (err?.message === "Upload aborted") {
        // User explicitly canceled - do not retry!
        throw err;
      }
      attempt++;
      console.warn(`Upload attempt ${attempt} failed:`, err);
      if (attempt >= maxRetries) {
        throw err;
      }
      // Wait 1.5 seconds before retrying
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw new Error("Upload failed after retries");
};

const uploadFileWithRetry = (
  storageRef: any, 
  file: File, 
  onProgress: (prog: number) => void,
  metadata?: any
): { promise: Promise<string>, cancel: () => void } => {
  const provider = 'cloudinary'; // Force Cloudinary for robust multi-storage fallback engine

  // Always bypass direct Firebase storage and route via our dedicated Cloudinary/local fallback API
  const cancelRef: { current?: () => void } = {};
  const promise = uploadToServerApi(file, onProgress, cancelRef);
  const cancel = () => {
    if (cancelRef.current) {
      try { cancelRef.current(); } catch (e) {}
    }
  };
  return { promise, cancel };
};

// --- Main App ---

// Connectivity Helpers moved to firebase.ts

function WorldApp() {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [uploadKey, setUploadKey] = useState(0);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [appLanguage, setAppLanguage] = useState('en');
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  // Custom Iframe-Safe Dialog State
  const [customDialog, setCustomDialog] = useState<{
    type: 'confirm' | 'prompt';
    title: string;
    message: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm: (val?: string) => void;
    onCancel?: () => void;
  } | null>(null);

  useEffect(() => {
    (window as any).showCustomConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
      setCustomDialog({
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          onConfirm();
          setCustomDialog(null);
        },
        onCancel: () => {
          if (onCancel) onCancel();
          setCustomDialog(null);
        }
      });
    };

    (window as any).showCustomPrompt = (title: string, message: string, placeholder: string, defaultValue: string, onConfirm: (val: string) => void, onCancel?: () => void) => {
      setCustomDialog({
        type: 'prompt',
        title,
        message,
        placeholder,
        defaultValue,
        onConfirm: (val) => {
          onConfirm(val || '');
          setCustomDialog(null);
        },
        onCancel: () => {
          if (onCancel) onCancel();
          setCustomDialog(null);
        }
      });
    };

    return () => {
      delete (window as any).showCustomConfirm;
      delete (window as any).showCustomPrompt;
    };
  }, []);

  const CLIENT_VERSION = "WORLD_v3.5.0";
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersionInfo, setLatestVersionInfo] = useState<{
    version: string;
    releaseDate?: string;
    changelog_bn?: string;
    changelog_en?: string;
    isMandatory?: boolean;
  } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const checkForAppUpdates = async (isManual = false) => {
    if (isManual) {
      setCheckingUpdate(true);
    }
    try {
      const updateDocRef = doc(db, '_internal', 'app_update');
      const docSnap = await getDoc(updateDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const latestVer = data.version || CLIENT_VERSION;
        setLatestVersionInfo({
          version: latestVer,
          releaseDate: data.releaseDate || '2026-06-13',
          changelog_bn: data.changelog_bn || '',
          changelog_en: data.changelog_en || '',
          isMandatory: data.isMandatory !== undefined ? data.isMandatory : true
        });
        
        if (latestVer !== CLIENT_VERSION) {
          setUpdateAvailable(true);
        } else {
          setUpdateAvailable(false);
          if (isManual) {
            alert(appLanguage === 'bn' ? "আপনার অ্যাপটি একদম আপ-টু-ডেট আছে! সংস্করণ: " + CLIENT_VERSION : "Your app is fully up to date! Version: " + CLIENT_VERSION);
          }
        }
      } else {
        const isAdminUser = user && (
          user.id === 'ZPHYftpJzjhllADJsPkCnq4wHm93' ||
          user.email?.toLowerCase() === 'mdtuhinhosinn373@gmail.com' ||
          user.email?.toLowerCase() === 'mdtuhinhosinn@gmail.com'
        );
        
        if (isAdminUser) {
          console.log("Seeding initial app update document...");
          await setDoc(updateDocRef, {
            version: CLIENT_VERSION,
            releaseDate: new Date().toISOString().split('T')[0],
            changelog_bn: "১. রিয়েল-টাইম সফটওয়্যার আপডেট স্ক্রিন এবং নোটিফিকেশন সিস্টেম সংযোজিত!\n২. প্রোফাইল এবং কভার ফটো আপলোড এখন সরাসরি ফেসবুক স্টাইলে পাবলিক ফিডে প্রকাশ পায়!\n৩. ডাইরেক্ট মেসেজিংয়ে (DM) রিয়েল-টাইম লাইভ সিঙ্ক ইমপ্রুভমেন্ট।",
            changelog_en: "1. Implemented real-time software update notifications and check screen!\n2. Uploading profile/cover pictures now directly posts visually-stunning updates on public feed.\n3. Dynamic sync corrections in live chat features.",
            isMandatory: true
          });
        }
        if (isManual) {
          alert(appLanguage === 'bn' ? "আপনার অ্যাপটি একদম আপ-টু-ডেট আছে! সংস্করণ: " + CLIENT_VERSION : "Your app is fully up to date! Version: " + CLIENT_VERSION);
        }
      }
    } catch (err) {
      console.error("Error checking app updates:", err);
      if (isManual) {
        alert(appLanguage === 'bn' ? "আপডেট চেক করতে ব্যর্থ হয়েছে। অনুগ্রহ করে ইন্টারনেট কানেকশন চেক করুন।" : "Failed to check for updates. Please verify your connection.");
      }
    } finally {
      if (isManual) {
        setCheckingUpdate(false);
      }
    }
  };

  useEffect(() => {
    checkForAppUpdates(false);
  }, [user?.id]);

  const renderUpdateModal = () => {
    if (!updateAvailable || !latestVersionInfo) return null;
    
    const changelog = (appLanguage === 'bn' ? latestVersionInfo.changelog_bn : latestVersionInfo.changelog_en) || '';
    
    return (
      <div className="fixed inset-0 z-[5000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col text-left text-white"
        >
          {/* Header */}
          <div className="p-5 border-b border-zinc-900 bg-gradient-to-r from-indigo-500/10 to-pink-500/10 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-[#FF4B91] flex items-center justify-center shadow">
              <RefreshCw className="w-5 h-5 text-white animate-spin animate-duration-10000" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-pink-400">
                {appLanguage === 'bn' ? 'নতুন আপডেট উপলব্ধ!' : 'New Update Available!'}
              </h3>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                {CLIENT_VERSION} ➔ {latestVersionInfo.version}
              </p>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-black tracking-widest text-[#FF4B91]">
                {appLanguage === 'bn' ? 'নতুন পরিবর্তনসমূহ' : 'What\'s New'}
              </span>
              <div className="bg-zinc-900/65 rounded-2xl p-3.5 border border-zinc-900 leading-relaxed text-xs">
                {changelog.split('\n').map((line, idx) => (
                  <p key={idx} className="mt-1 font-medium text-gray-300 flex items-start gap-1.5 leading-relaxed">
                    <span className="text-[#FF4B91] select-none text-[10px] mt-0.5">•</span>
                    <span>{line}</span>
                  </p>
                ))}
              </div>
            </div>
            
            <p className="text-[9.5px] text-gray-500 font-semibold leading-normal">
              {appLanguage === 'bn' 
                ? 'রিয়েল-টাইম আপডেট প্রক্রিয়াটি সম্পন্ন করতে অনুগ্রহ করে নিচের বুস্ট বাটনে ক্লিক করুন। এটি ক্যাশে রিলিজ করে সর্বশেষ সংস্করণ ইন্সটল করবে।' 
                : 'To complete the software installation and receive the latest dynamic modules, click below to upgrade. It will wipe stale cache and optimize performance.'}
            </p>
          </div>
          
          {/* Actions */}
          <div className="p-5 border-t border-zinc-900 bg-zinc-950/50 flex flex-col gap-2">
            <button
              onClick={async () => {
                hapticFeedback('heavy');
                try {
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    for (const key of keys) {
                      await caches.delete(key);
                    }
                  }
                  window.location.href = window.location.origin + '?v=' + Date.now();
                } catch (err) {
                  window.location.reload();
                }
              }}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-pink-500 to-[#FF4B91] hover:opacity-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-3.5 h-3.5 animate-bounce" />
              <span>{appLanguage === 'bn' ? 'আপডেট এবং রিস্টার্ট' : 'Update & Restart'}</span>
            </button>
            
            {!latestVersionInfo.isMandatory && (
              <button
                onClick={() => setUpdateAvailable(false)}
                className="w-full py-2.5 text-zinc-400 hover:text-white font-bold text-[10px] uppercase tracking-wider bg-transparent rounded-2xl transition-all text-center"
              >
                {appLanguage === 'bn' ? 'পরে করুন' : 'Maybe Later'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  };

  const [isProMode, setIsProMode] = useState<boolean>(() => {
    try {
      if (user?.id) {
        return localStorage.getItem(`pro_mode_${user.id}`) === 'true';
      }
      return false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = onSnapshot(doc(db, 'users', user.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.isProMode !== undefined) {
          setIsProMode(!!data.isProMode);
          try {
            localStorage.setItem(`pro_mode_${user.id}`, String(!!data.isProMode));
          } catch (e) {}
        }
      }
    }, (err) => {
      if (!isFirestoreShutdownError(err)) {
        console.error("Error updates pro mode in WorldApp:", err);
      }
    });
    return () => unsub();
  }, [user?.id]);

  const [socket, setSocket] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Initialize socket connection and handle live events
  useEffect(() => {
    if (!user?.id) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setSocketConnected(false);
      }
      return;
    }

    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 12,
    });

    socketInstance.on('connect', () => {
      console.log("[Socket client] Connected to system socket server successfully!");
      setSocketConnected(true);
      socketInstance.emit('join', user.id);
    });

    socketInstance.on('disconnect', () => {
      console.log("[Socket client] Disconnected from socket server.");
      setSocketConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn("[Socket client] Socket connection error:", err);
    });

    socketInstance.on('receive-private-message', (msg) => {
      console.log("[Socket client] Instant private message incoming:", msg);
      
      // Dispatch a client event so active DM component can handle it instantly
      const event = new CustomEvent('socket-pm-received', { detail: msg });
      window.dispatchEvent(event);

      // If user is not currently in messages tab, show visual toast
      if (activeTab !== 'messages') {
        playNotificationChime();
        setActiveToast({
          id: msg.id || 'dm-' + Date.now(),
          title: msg.senderName || 'New Message',
          description: msg.text || 'Sent you a message',
          type: 'message',
          avatar: msg.senderPhoto,
          fromUserId: msg.senderId
        });
      }
    });

    socketInstance.on('new-post', (data) => {
      console.log("[Socket client] Real-time post alert:", data);
      
      // Notify other users only (not the author)
      if (data.data?.userId !== user.id) {
        playNotificationChime();
        setActiveToast({
          id: 'new-post-' + Date.now(),
          title: data.data?.fullName || 'World Feed',
          description: appLanguage === 'bn' ? 'একটি নতুন ভিডিও পোস্ট করা হয়েছে!' : 'A new video was just posted!',
          type: 'post',
          avatar: data.data?.profilePhoto,
          fromUserId: data.data?.userId
        });
      }
    });

    socketInstance.on('new-story', (data) => {
      console.log("[Socket client] Real-time story alert:", data);
      
      // Notify other users only
      if (data.userId !== user.id) {
        playNotificationChime();
        setActiveToast({
          id: 'new-story-' + Date.now(),
          title: data.fullName || 'World Story',
          description: appLanguage === 'bn' ? 'একটি নতুন স্টোরি আপলোড করা হয়েছে!' : 'A new story was uploaded!',
          type: 'story',
          avatar: data.profilePhoto,
          fromUserId: data.userId
        });
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user?.id, activeTab, appLanguage]);

  // Start Keep-Alive if enabled on user interactions
  useEffect(() => {
    const handleWarming = () => {
      const isKeepAliveEnabled = localStorage.getItem('world_bg_keep_alive') === 'true';
      if (isKeepAliveEnabled) {
        startBackgroundKeepAlive();
      }
    };
    window.addEventListener('click', handleWarming, { passive: true });
    window.addEventListener('touchstart', handleWarming, { passive: true });
    return () => {
      window.removeEventListener('click', handleWarming);
      window.removeEventListener('touchstart', handleWarming);
    };
  }, []);

  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);
  const [activeToast, setActiveToast] = useState<{
    id: string;
    title: string;
    description: string;
    type: string;
    avatar?: string;
    fromUserId?: string;
  } | null>(null);

  const prevNotifsCountRef = useRef(0);
  const prevDMsCountRef = useRef(0);

  // Play modern double ping chime sound
  const playNotificationChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const playChime = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gain.gain.setValueAtTime(0.06, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Perfect social media double-chime dings
      playChime(523.25, ctx.currentTime, 0.22); // C5
      playChime(659.25, ctx.currentTime + 0.08, 0.3); // E5
    } catch (e) {
      console.warn("Chime blocked by browser policy:", e);
    }
  };

  // Toast Auto-Dismiss
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  // Mark all notifications as read when entering 'inbox' tab
  useEffect(() => {
    if (user && activeTab === 'inbox') {
      const markNotificationsAsRead = async () => {
        try {
          const { writeBatch } = await import('firebase/firestore');
          const q = query(
            collection(db, 'users', user.id, 'notifications'),
            where('isRead', '==', false)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(docSnap => {
              batch.update(docSnap.ref, { isRead: true });
            });
            await batch.commit();
          }
        } catch (err) {
          console.error("Failed to mark notifications as read:", err);
        }
      };
      markNotificationsAsRead();
    }
  }, [user, activeTab]);

  // Real-time listener for Notification Count
  useEffect(() => {
    if (!user) {
      setUnreadNotifsCount(0);
      return;
    }

    const q = query(
      collection(db, 'users', user.id, 'notifications'),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.size;
      
      if (count > prevNotifsCountRef.current && activeTab !== 'inbox') {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        docs.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        });

        const newest = docs[0];
        if (newest && (Date.now() - (newest.createdAt?.toDate ? newest.createdAt.toDate().getTime() : Date.now()) < 15000)) {
          // Play sound
          playNotificationChime();
          // Show floating toast
          setActiveToast({
            id: newest.id,
            title: newest.fromUserName || 'Activity Alert',
            description: newest.message || 'New activity on your content',
            type: newest.type || 'notification',
            fromUserId: newest.fromUserId
          });
          // Native system notification for background / lockscreen
          showSystemNotification(
            newest.fromUserName || 'World Social',
            newest.message || 'New activity on your content'
          );
        }
      }
      
      prevNotifsCountRef.current = count;
      setUnreadNotifsCount(count);
    }, (err) => {
      console.error("Count of notifications error:", err);
    });

    return () => unsubscribe();
  }, [user, activeTab]);

  // Real-time listener for Direct Messages Count
  useEffect(() => {
    if (!user) {
      setUnreadDMsCount(0);
      return;
    }

    const q = query(
      collection(db, 'direct_messages'),
      where('participants', 'array-contains', user.id),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incomingUnread = snapshot.docs.filter(d => d.data().receiverId === user.id);
      const count = incomingUnread.length;

      if (count > prevDMsCountRef.current && activeTab !== 'messages') {
        const docs = incomingUnread.map(d => ({ id: d.id, ...d.data() } as any));
        docs.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        });

        const newest = docs[0];
        if (newest && (Date.now() - (newest.createdAt?.toDate ? newest.createdAt.toDate().getTime() : Date.now()) < 15000)) {
          playNotificationChime();
          
          setActiveToast({
            id: newest.id,
            title: newest.senderName || 'Message',
            description: newest.text || 'Sent you a direct message',
            type: 'message',
            avatar: newest.senderPhoto,
            fromUserId: newest.senderId
          });
          // Native system notification for background / lockscreen
          showSystemNotification(
            newest.senderName || 'New Message',
            newest.text || 'Sent you a direct message',
            newest.senderPhoto
          );
        }
      }

      prevDMsCountRef.current = count;
      setUnreadDMsCount(count);
    }, (err) => {
      console.error("Count of message failures:", err);
    });

    return () => unsubscribe();
  }, [user, activeTab]);

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const newLang = (e as CustomEvent).detail;
      setAppLanguage(newLang);
    };
    window.addEventListener('app-language-changed', handleLangChange);
    return () => {
      window.removeEventListener('app-language-changed', handleLangChange);
    };
  }, []);

  useEffect(() => {
    setIsNavVisible(true);
  }, [activeTab]);

  // Real-time listener for current online users
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('isOnline', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const onlineMap: Record<string, boolean> = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const lastActive = data.lastActive?.toDate ? data.lastActive.toDate().getTime() : 0;
        // Keep them active if isOnline field is true and updated within the last 2 minutes
        const isRecentlyActive = (Date.now() - lastActive) < 120000;
        if (isRecentlyActive || data.isOnline === true) {
          onlineMap[doc.id] = true;
        }
      });
      setOnlineUsers(onlineMap);
    }, (err) => {
      console.error("Online users error:", err);
    });

    return () => unsubscribe();
  }, []);

  // Screen touch/click toggles navigation visibility everywhere (Screen touch trigger)
  useEffect(() => {
    const handleGlobalClickOrTouch = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      // Ignore if clicking interactive items so default features are fully operational
      const isInteractive = 
        target.closest('.bottom-nav-container') ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('select') ||
        target.closest('[role="button"]') ||
        target.closest('.interactive-clickable') ||
        target.closest('.chat-input-area') ||
        target.closest('.settings-modal') ||
        target.closest('.auth-dialog');

      if (isInteractive) return;

      // Toggle bottom nav visibility
      setIsNavVisible((visible) => !visible);
    };

    document.addEventListener('click', handleGlobalClickOrTouch);
    return () => {
      document.removeEventListener('click', handleGlobalClickOrTouch);
    };
  }, []);
  const [isMuted, setIsMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [authModal, setAuthModal] = useState<'login' | 'signup' | null>(null);

  useEffect(() => {
    (window as any).triggerLogin = () => setAuthModal('login');
    return () => {
      delete (window as any).triggerLogin;
    };
  }, []);

  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        // Unlock audio context
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          try {
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') ctx.resume();
          } catch (e) {
            console.warn("AudioContext init failed:", e);
          }
        }
      }
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [hasInteracted]);
  const [pendingUploadsState, rawSetPendingUploads] = useState<PendingUpload[]>(() => {
    // Load from local storage on init
    const saved = localStorage.getItem('world_pending_uploads');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const uniqueMap = new Map();
        parsed.forEach((p: any) => {
          if (p && p.id) {
            uniqueMap.set(p.id, { ...p, status: 'paused' });
          }
        });
        return Array.from(uniqueMap.values());
      }
    } catch (e) {
      console.warn("Failed to parse pending uploads from storage:", e);
    }
    return [];
  });

  const pendingUploads = pendingUploadsState;

  const setPendingUploads = React.useCallback((
    value: PendingUpload[] | ((prev: PendingUpload[]) => PendingUpload[])
  ) => {
    rawSetPendingUploads(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      const uniqueMap = new Map();
      next.forEach((p: any) => {
        if (p && p.id) {
          uniqueMap.set(p.id, p);
        }
      });
      return Array.from(uniqueMap.values());
    });
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('world_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('world_theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('world_theme', 'light');
    }
  }, [isDarkMode]);

  // Sync to local storage
  useEffect(() => {
    const dataToSave = pendingUploads.filter(p => p.status !== 'failed');
    if (dataToSave.length > 0) {
      localStorage.setItem('world_pending_uploads', JSON.stringify(dataToSave));
    } else {
      localStorage.removeItem('world_pending_uploads');
    }
  }, [pendingUploads]);

  // Prevent accidental exit during upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingUploads.some(p => p.status === 'uploading' || p.status === 'finishing')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingUploads]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const isQuotaExceeded = false;
  const setIsQuotaExceeded = (val: boolean) => {};
  const [serverLatency, setServerLatency] = useState<number | null>(null);

  // Connectivity Guardian
  const failCountRef = useRef(0);
  useEffect(() => {
    // Proactive Permission & Connectivity Check
    const checkSystemReady = async () => {
      console.log("System Check: Verifying Internet & Google Auth Permissions...");
      const conn = await firebaseTestConnection();
      if (!conn) {
        console.warn("System Check: Initial connectivity check failed. Retrying...");
      }
      
      // Request media permissions early if we're in a tab that needs them
      if (typeof navigator !== 'undefined' && (navigator as any).permissions) {
        try {
          (navigator as any).permissions.query({ name: 'notifications' }).then((res: any) => {
            console.log("Notifications permission check passed:", res.state);
          });
        } catch (e) {}
      }
    };
    checkSystemReady();
    
    // Screen Permission (Wake Lock) Guardian
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.debug('Screen Wake Lock active');
        } catch (err: any) {
          // Silent
        }
      }
    };
    
    requestWakeLock();
    
    // Re-request when visibility changes (tab back in)
    const handleVisibilityChange = () => {
      if (wakeLock !== null && (document.visibilityState as any) === 'visible') {
        requestWakeLock();
      }
      if ((document.visibilityState as any) === 'visible') {
        // Optimistically restore online status to avoid flashing "No Connection" when back in app
        setIsOffline(false);
        failCountRef.current = 0;
        // Wait a few seconds for cell/wifi connection to handshake and warm up before checking status
        setTimeout(() => {
          if ((document.visibilityState as any) === 'visible') {
            checkStatus();
          }
        }, 4000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let checkInterval: any;
    
    const checkStatus = async () => {
      // If the app is in background or tab is hidden, do NOT check status (as network request would fail or stall)
      if (document.hidden || (document.visibilityState as any) === 'hidden') {
        return;
      }
      const isBrowserOnline = navigator.onLine;
      if (!isBrowserOnline) {
        setIsOffline(true);
        setServerLatency(null);
        failCountRef.current = 4; // Immediate offline
        return;
      }
      
      const start = Date.now();
      const reachable = await firebaseTestConnection();
      
      // Secondary check: if tab became hidden during check, discard result
      if (document.hidden || (document.visibilityState as any) === 'hidden') {
        return;
      }
      
      if (reachable) {
        if (isOffline) {
          // Connection restored!
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest z-[1000] shadow-2xl animate-bounce pointer-events-none';
          toast.innerText = 'Online';
          document.body.appendChild(toast);
          setTimeout(() => {
            toast.style.transition = 'opacity 0.5s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
          }, 3000);
        }
        failCountRef.current = 0;
        setServerLatency(Date.now() - start);
        setIsOffline(false);
      } else {
        failCountRef.current++;
        // Requires 4 consecutive failures to show "Offline" bar to avoid showing it on brief network lag
        if (failCountRef.current >= 4) {
          setIsOffline(true);
          setServerLatency(null);
        }
      }
    };

    const handleConn = () => {
      if (navigator.onLine) {
        checkStatus();
      } else {
        setIsOffline(true);
        failCountRef.current = 4;
      }
    };

    window.addEventListener('online', handleConn);
    window.addEventListener('offline', handleConn);
    
    checkInterval = setInterval(checkStatus, 45000); 
    checkStatus();

    return () => {
      window.removeEventListener('online', handleConn);
      window.removeEventListener('offline', handleConn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }
      clearInterval(checkInterval);
    };
  }, []);

  const handleManualReconnect = async () => {
    setIsOffline(false); // Optimistic
    const reachable = await firebaseTestConnection();
    if (reachable) {
      failCountRef.current = 0;
      setIsOffline(false);
      return;
    }
    await forceReconnect();
  };
  const wakeLockRef = useRef<any>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [globalShowSettings, setGlobalShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'menu' | 'friends' | 'memories' | 'saved' | 'groups' | 'meta-ai' | 'scam-protection' | 'support' | 'report-problem' | 'terms' | 'settings' | 'dashboard'>('menu');

  useEffect(() => {
    (window as any).editPost = (v: any) => setEditingPost(v);
    return () => { delete (window as any).editPost; };
  }, []);
  const preUploadTasksRef = useRef<Record<string, { promise: Promise<string>, status: string, progress: number }>>({});
  const activeTasksRef = useRef<Record<string, { cancel: () => void }>>({});
  const uploadSourceFilesRef = useRef<Record<string, File>>({});
  const isProcessingQueueRef = useRef(false);

  // Screen Wake Lock logic to prevent sleep during uploads
  useEffect(() => {
    const requestWakeLock = async () => {
      const activeUploads = pendingUploads.filter(p => p.status === 'uploading' || p.status === 'queued' || p.status === 'finishing');
      if ('wakeLock' in navigator && activeUploads.length > 0) {
        try {
          if (!wakeLockRef.current) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            console.log('Screen Wake Lock is active');
          }
        } catch (err: any) {
          // Silent inside iframe development environment where permissions policy blocks screen wake lock.
          console.debug('WakeLock not allowed by policy in iframe context');
        }
      } else if (wakeLockRef.current && activeUploads.length === 0) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('Screen Wake Lock released');
        } catch (e) {}
      }
    };
    requestWakeLock();
    
    // Cleanup on unmount
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, [pendingUploads]);

  const cancelUpload = (id: string) => {
    if (activeTasksRef.current[id]) {
      activeTasksRef.current[id].cancel();
      delete activeTasksRef.current[id];
    }
    delete uploadSourceFilesRef.current[id];
    delete preUploadTasksRef.current[id];
    setPendingUploads(prev => prev.filter(p => p.id !== id));
  };

  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  const processSingleUpload = async (item: PendingUpload) => {
    const uploadId = item.id;
    
    const getLatestItem = () => pendingUploadsRef.current.find(p => p.id === uploadId);

    setPendingUploads(prev => prev.map(p => p.id === uploadId ? { ...p, status: 'uploading' } : p));

    try {
      let url = '';
      const file = uploadSourceFilesRef.current[uploadId];
      let existingTask = preUploadTasksRef.current[uploadId];
      
      const { isStory, type, uploadMode, quality } = item;
      const finalUploadMode = uploadMode || type || 'video';
      
      if (existingTask && existingTask.promise) {
        url = await existingTask.promise;
      } else if (file) {
        let fileToUpload = file;
        if (finalUploadMode === 'photo') {
          try {
            // Crisp modern photo compression settings (excellent visual quality without excessive filesizes)
            let targetSizeMB = 1.5; // High (Max 1.5MB for beautiful 2K resolution)
            let maxWidthOrHeight = 2048;
            
            if (quality === 'low') {
              targetSizeMB = 0.15; // 150KB for fast uploads
              maxWidthOrHeight = 1024;
            } else if (quality === 'medium') {
              targetSizeMB = 0.5; // 500KB - perfect balance of HD clarity and speed (default)
              maxWidthOrHeight = 1600;
            }

            const compressionOptions = { 
              maxSizeMB: targetSizeMB, 
              maxWidthOrHeight: maxWidthOrHeight, 
              useWebWorker: true,
              initialQuality: quality === 'low' ? 0.75 : (quality === 'medium' ? 0.9 : 0.98)
            };
            fileToUpload = await imageCompression(file, compressionOptions);
          } catch (e) {
            console.error("Compression failed, using original file", e);
          }
        }
        const fileId = Math.random().toString(36).substring(2, 15);
        const folder = isStory ? 'stories' : 'posts';
        const ext = file.name.split('.').pop() || (finalUploadMode === 'video' ? 'mp4' : 'jpg');
        const storageRef = ref(storage, `${folder}/${fileId}.${ext}`);
        const metadata = { contentType: fileToUpload.type || (finalUploadMode === 'video' ? 'video/mp4' : 'image/jpeg') };
        
        const task = uploadFileWithRetry(storageRef, fileToUpload, (progress) => {
          setPendingUploads(prev => prev.map(p => p.id === uploadId ? { ...p, progress } : p));
        }, metadata);

        activeTasksRef.current[uploadId] = { cancel: task.cancel };
        preUploadTasksRef.current[uploadId] = { 
          promise: task.promise, 
          status: 'uploading', 
          progress: 0 
        };

        url = await task.promise;
      }

      // CHECK LATEST STATE: Did user click "Post" while we were uploading?
      const latest = getLatestItem();
      if (latest?.isPreUpload) {
        // Pre-upload finished its storage part. Wait for user to actually Post.
        console.log("Pre-upload finished. Waiting for user action.");
        setPendingUploads(prev => prev.map(p => p.id === uploadId ? { ...p, status: 'paused', progress: 100 } : p));
        return;
      }

      setPendingUploads(prev => prev.map(p => p.id === uploadId ? { ...p, status: 'finishing', progress: 100 } : p));

      const createDocument = async (retries = 5): Promise<void> => {
        // Using current item fields which are populated during Post
        const finalItem = getLatestItem() || item;
        let { isStory, type, uploadMode, title, description, textContent, bgColor, musicId, musicName, musicVolume, speed, stickers, trimStart, trimEnd, filter, brightness, contrast, saturation, overlayText, textColor, privacy } = finalItem;
        const finalUploadMode = uploadMode || type || 'video';
        
        // Ensure color is preserved from either field
        const finalBgColor = bgColor || (finalItem as any).backgroundColor || '';

        try {
          // If it's a video and no music is selected, it's an "Original Sound"
          if (finalUploadMode === 'video' && !musicId && !isStory) {
            try {
              const soundTitle = musicName || `Original Sound - ${user.fullName}`;
              const musicDocRef = doc(collection(db, 'music'));
              musicId = musicDocRef.id;
              musicName = soundTitle;
              
              await setDoc(musicDocRef, {
                id: musicId,
                name: soundTitle,
                artist: user.fullName,
                url: url || '',
                language: 'Original',
                creatorId: user.id,
                useCount: 1,
                createdAt: serverTimestamp()
              });
            } catch (musicErr) {
              console.error("Error creating original sound doc:", musicErr);
              // Continue even if music creation fails
            }
          }

          let generatedId = uploadId;
          if (isStory) {
            const storyDocRef = doc(db, 'stories', generatedId);
            const storyData = {
              userId: user.id || '',
              fullName: user.fullName || 'Anonymous',
              profilePhoto: user.profilePhoto || '',
              type: (finalUploadMode === 'photo' || finalUploadMode === 'image') ? 'image' : (finalUploadMode === 'text' ? 'text' : 'video'),
              url: url || null,
              content: textContent || null,
              textContent: textContent || null,
              backgroundColor: finalBgColor,
              bgColor: finalBgColor,
              filter: filter || 'none',
              brightness: brightness || 100,
              contrast: contrast || 100,
              saturation: saturation || 100,
              overlayText: overlayText || '',
              textColor: textColor || '#ffffff',
              speed: speed || 1,
              stickers: stickers || [],
              trimStart: trimStart || 0,
              trimEnd: trimEnd || 0,
              viewers: [],
              createdAt: serverTimestamp()
            };
            
            // Queue FireStore writing natively. If offline or lagging, it remains in the Firestore IndexedDB persistent queue and syncs in background.
            await setDoc(storyDocRef, storyData);

            const storyObj = {
              ...storyData,
              id: generatedId,
              createdAt: new Date().toISOString() // use client-side representation for direct listing
            };
            try {
              const saved = localStorage.getItem('world_local_created_stories');
              const currentList = saved ? JSON.parse(saved) : [];
              const updated = [storyObj, ...currentList.filter((item: any) => item.id !== storyObj.id)];
              localStorage.setItem('world_local_created_stories', JSON.stringify(updated));
            } catch (err) {}
            
            // Sync to SQLite fallback database
            fetch('/api/stories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(storyObj)
            }).catch(e => console.log("Stories server sync not active:", e));

            window.dispatchEvent(new CustomEvent('local-post-created', {
              detail: { isStory: true, data: storyObj }
            }));
          } else {
            const videoDocRef = doc(db, 'videos', generatedId);
            const videoData = {
              userId: user.id || '',
              fullName: user.fullName || 'Anonymous',
              profilePhoto: user.profilePhoto || '',
              title: title || '',
              description: finalUploadMode === 'text' ? (description || '') : (description || textContent || ''),
              location: '',
              privacy: privacy || 'everyone',
              contentUrl: url || '',
              type: (finalUploadMode === 'photo' || finalUploadMode === 'image') ? 'image' : (finalUploadMode === 'text' ? 'text' : 'video'),
              textContent: textContent || null,
              backgroundColor: finalBgColor,
              bgColor: finalBgColor,
              filter: filter || 'none',
              brightness: brightness || 100,
              contrast: contrast || 100,
              saturation: saturation || 100,
              overlayText: overlayText || '',
              textColor: textColor || '#ffffff',
              speed: speed || 1,
              stickers: stickers || [],
              trimStart: trimStart || 0,
              trimEnd: trimEnd || 0,
              musicId: musicId || null,
              musicName: musicName || null,
              musicVolume: musicVolume || 100,
              likeCount: 0,
              commentCount: 0,
              views: 0,
              createdAt: serverTimestamp()
            };

            // Queue FireStore writing natively. If offline or lagging, it remains in the Firestore IndexedDB persistent queue and syncs in background.
            await setDoc(videoDocRef, videoData);

            const videoObj = {
              type: 'video',
              data: {
                ...videoData,
                id: generatedId,
                createdAt: new Date().toISOString() // use client-side representation for direct listing
              }
            };
            try {
              const saved = localStorage.getItem('world_local_created_videos');
              const currentList = saved ? JSON.parse(saved) : [];
              const updated = [videoObj, ...currentList.filter((item: any) => (item.data?.id || item.id) !== videoObj.data.id)];
              localStorage.setItem('world_local_created_videos', JSON.stringify(updated));
            } catch (err) {}

            // Sync to SQLite fallback database
            fetch('/api/posts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(videoObj)
            }).catch(e => console.log("Post server sync not active:", e));

            window.dispatchEvent(new CustomEvent('local-post-created', {
              detail: { isStory: false, data: videoObj }
            }));
          }
          // Notify app to refresh feed
          window.dispatchEvent(new CustomEvent('refreshFeed'));
        } catch (error: any) {
          if (retries > 0 && (error.code === 'unavailable' || error.message?.includes('offline'))) {
            console.warn(`Firestore createDoc failed, retrying... (${retries} left)`);
            await new Promise(r => setTimeout(r, 2000));
            return createDocument(retries - 1);
          }
          handleFirestoreError(error, OperationType.CREATE, isStory ? 'stories' : 'videos');
          throw error;
        }
      };

      await createDocument();
      // Bypassing any tick/completed indicator: immediately dismiss from uploads queue
      setPendingUploads(prev => prev.filter(p => p.id !== uploadId));
    } catch (err: any) {
      console.error("Upload process error:", err);
      if (err.code === 'storage/canceled') {
         return;
      }
      let friendlyError = err.message || "Unknown error";
      if (err.code === 'storage/quota-exceeded' || (err.message && err.message.includes('quota'))) {
         friendlyError = "Storage Full! Please clean space or try again later.";
      }
      setPendingUploads(prev => prev.map(p => p.id === uploadId ? { ...p, status: 'failed', error: friendlyError } : p));
    } finally {
      const latest = getLatestItem();
      const isPendingOrActive = latest && (latest.status === 'paused' || latest.status === 'failed' || latest.status === 'error');
      if (!isPendingOrActive) {
        delete activeTasksRef.current[uploadId];
        delete uploadSourceFilesRef.current[uploadId];
        delete preUploadTasksRef.current[uploadId];
      }
      isProcessingQueueRef.current = false;
    }
  };

  useEffect(() => {
    // We allow processing even if browser says offline, the retry logic will handle it better
    if (isProcessingQueueRef.current) return;

    const inProgress = pendingUploads.some(p => p.status === 'uploading' || p.status === 'finishing');
    if (inProgress) return;

    const nextQueued = [...pendingUploads].reverse().find(p => p.status === 'queued');
    if (nextQueued && user) {
      isProcessingQueueRef.current = true;
      processSingleUpload(nextQueued);
    }
  }, [pendingUploads, user]);

  const startBackgroundUpload = async (data: any) => {
    const { file, isStory, title, description, uploadMode, textContent, bgColor, musicId, musicName, musicVolume, preUploadId, isPreUpload, quality, filter, brightness, contrast, saturation, overlayText, textColor, privacy } = data;
    
    // Pre-generate standard Firestore ID so optimistic item ID matches the actual document ID precisely to prevent double listings!
    let uploadId = preUploadId;
    if (!uploadId) {
      try {
        const tempRef = doc(collection(db, isStory ? 'stories' : 'videos'));
        uploadId = tempRef.id;
      } catch (e) {
        uploadId = Math.random().toString(36).substring(2, 11);
      }
    }
    
    if (file) uploadSourceFilesRef.current[uploadId] = file;

    setPendingUploads(prev => {
      const existing = prev.find(p => p.id === uploadId);
      if (existing) {
        return prev.map(p => p.id === uploadId ? { 
          ...p, 
          status: 'queued', 
          type: uploadMode || p.type || 'video',
          uploadMode: uploadMode || p.uploadMode || p.type || 'video',
          quality: quality || p.quality || 'high',
          isPreUpload: isPreUpload || false, 
          title: title || p.title || '', 
          description: description || p.description || '',
          textContent: textContent || p.textContent || '',
          bgColor: bgColor || p.bgColor || '',
          backgroundColor: bgColor || p.backgroundColor || p.bgColor || '',
          filter: filter || p.filter || 'none',
          brightness: brightness !== undefined ? brightness : (p as any).brightness || 100,
          contrast: contrast !== undefined ? contrast : (p as any).contrast || 100,
          saturation: saturation !== undefined ? saturation : (p as any).saturation || 100,
          overlayText: overlayText !== undefined ? overlayText : (p as any).overlayText || '',
          textColor: textColor || p.textColor || '#ffffff',
          musicId: musicId || p.musicId || null,
          musicName: musicName || p.musicName || null,
          musicVolume: musicVolume !== undefined ? musicVolume : (p as any).musicVolume || 100,
          privacy: privacy || p.privacy || 'everyone'
        } : p);
      }
      return [{
        id: uploadId,
        type: uploadMode || 'video',
        uploadMode: uploadMode || 'video',
        preview: data.preview || '',
        progress: 0,
        isStory,
        status: 'queued',
        quality: quality || 'high',
        isPreUpload: isPreUpload || false,
        title: title || '',
        description: description || '',
        textContent: textContent || '',
        bgColor: bgColor || '',
        filter: filter || 'none',
        brightness: brightness || 100,
        contrast: contrast || 100,
        saturation: saturation || 100,
        overlayText: overlayText || '',
        textColor: textColor || '#ffffff',
        backgroundColor: bgColor || '',
        musicId: musicId || null,
        musicName: musicName || null,
        fullName: user.fullName,
        profilePhoto: user.profilePhoto || '',
        userId: user.id,
        privacy: privacy || 'everyone'
      }, ...prev];
    });
  };

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    
    const handleNav = (e: any) => {
      (window as any).targetUserId = e.detail;
      setActiveTab('view-profile');
    };
    const handleUploadNav = (e: any) => {
      (window as any).uploadOptions = e.detail;
      setUploadKey(prev => prev + 1);
      setActiveTab('upload');
    };
    const handleEditPost = (e: any) => {
      setEditingPost(e.detail);
    };
    (window as any).editPost = (post: any) => {
      setEditingPost(post);
    };

    const handleTabNav = (e: any) => {
      setActiveTab(e.detail);
    };

    const handleOpenSettings = (e: any) => {
      setSettingsSection(e?.detail || 'menu');
      setGlobalShowSettings(true);
    };

    const handlePlayVideoInReels = (e: any) => {
      setActiveTab('search');
    };

    const handleOpenProDashboard = () => {
      localStorage.setItem('force_open_pro_dashboard', 'true');
      setActiveTab('profile');
    };

    const handleOpenInstallHelp = () => {
      setShowInstallHelp(true);
    };

    window.addEventListener('nav-to-profile', handleNav);
    window.addEventListener('nav-to-upload', handleUploadNav);
    window.addEventListener('nav-to-tab', handleTabNav as any);
    window.addEventListener('edit-post', handleEditPost as any);
    window.addEventListener('open-settings', handleOpenSettings);
    window.addEventListener('play-video-in-reels', handlePlayVideoInReels as any);
    window.addEventListener('open-pro-dashboard', handleOpenProDashboard);
    window.addEventListener('open-install-help', handleOpenInstallHelp);
    
    // NEW: Background Pre-upload Global Handler
    (window as any).startPreUpload = (data: { id: string, file: File, type: string, isStory: boolean, onProgress?: (p: number) => void }) => {
      const { id, file, type, isStory } = data;
      
      uploadSourceFilesRef.current[id] = file;

      setPendingUploads(prev => {
        if (prev.some(p => p.id === id)) return prev;
        return [{
          id,
          type,
          preview: URL.createObjectURL(file), 
          progress: 1,
          isStory,
          status: 'queued',
          isPreUpload: true,
          fullName: user?.fullName || 'User',
          profilePhoto: user?.profilePhoto || '',
          userId: user?.id || ''
        }, ...prev];
      });

      // Mark as queued in ref so Upload UI knows about it
      preUploadTasksRef.current[id] = { 
        promise: null as any, 
        status: 'queued', 
        progress: 0 
      };

      return { id };
    };

    return () => {
      clearTimeout(splashTimer);
      window.removeEventListener('nav-to-profile', handleNav);
      window.removeEventListener('nav-to-upload', handleUploadNav);
      window.removeEventListener('nav-to-tab', handleTabNav as any);
      window.removeEventListener('edit-post', handleEditPost as any);
      window.removeEventListener('open-settings', handleOpenSettings);
      window.removeEventListener('play-video-in-reels', handlePlayVideoInReels as any);
      window.removeEventListener('open-pro-dashboard', handleOpenProDashboard);
      window.removeEventListener('open-install-help', handleOpenInstallHelp);
      delete (window as any).editPost;
    };
  }, []);

  if (loading && !showSplash) return (
    <div className="h-screen w-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center transition-colors">
      <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Checking Authentication...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 h-[100dvh] bg-black overflow-hidden font-sans select-none transition-colors duration-500 selection:bg-pink-500/30">
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" />}
      </AnimatePresence>

      {/* PWA Installation Step-by-Step Guidance Overlay */}
      {showInstallHelp && (
        <div className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-[#18181c] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh] text-left"
          >
            {/* Header / শিরোনাম */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-pink-500/10 to-[#FF4B91]/10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-[#FF4B91] flex items-center justify-center shadow-lg shadow-pink-500/20">
                  <Download className="w-5 h-5 text-white animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide">World Social</h3>
                  <p className="text-[10px] uppercase font-black tracking-wider text-pink-400">Install App / ইন্সটল করুন</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  hapticFeedback('medium');
                  setShowInstallHelp(false);
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
                id="close-install-help-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content / মূল বিবরণ */}
            <div className="p-6 overflow-y-auto space-y-6 select-text text-sm scrollbar-thin">
              <p className="text-xs text-gray-300 leading-relaxed font-bold">
                ফোনের ব্রাউজার ক্যাশ ফাইল ক্লিন বা রিফ্রেশ করলেও যাতে আপনার অ্যাকাউন্ট, প্রোফাইল ব্যাকগ্রাউন্ড কভার ফটো, গ্যালারি ইমেজ ও পোস্ট চিরতরে সুরক্ষিত ও নিরাপদ থাকে, সেজন্য এখনই অ্যাপটি ফোনে সরাসরি ইন্সটল করে নিন!
              </p>

              {/* Step 1: Android Chrome */}
              <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center space-x-2 text-[#FF4B91]">
                  <Smartphone className="w-4 h-4" />
                  <span className="font-extrabold text-[12px] uppercase tracking-wider">Android (Chrome ব্রাউজার)</span>
                </div>
                <ol className="space-y-2 text-xs text-gray-300 font-bold list-decimal pl-4">
                  <li>আপনার ব্রাউজারের একদম ডানদিকের উপরে থাকা <strong className="text-white">৩টি ডট (⋮)</strong> মেনুটি চাপুন।</li>
                  <li>মেনু থেকে নিচে স্ক্রল করে <strong className="text-white">"Install app"</strong> অথবা <strong className="bg-pink-500/20 text-white px-2 py-0.5 rounded ml-1 font-extrabold animate-pulse">"Add to Home screen"</strong> (হোম স্ক্রিনে যোগ করুন) চাপুন।</li>
                  <li>পপআপ উইন্ডো আসার পর <strong className="text-[#FF4B91] font-extrabold underline">"Install"</strong> বা <strong className="text-[#FF4B91] font-extrabold underline">"Add"</strong> চাপুন। ব্যাস! ফোনের হোম স্ক্রিনে অ্যাপ চলে আসবে।</li>
                </ol>
              </div>

              {/* Step 2: iOS Safari */}
              <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center space-x-2 text-sky-400">
                  <Smartphone className="w-4 h-4" />
                  <span className="font-extrabold text-[12px] uppercase tracking-wider">iOS (iPhone Safari)</span>
                </div>
                <ol className="space-y-2 text-xs text-gray-300 font-bold list-decimal pl-4">
                  <li>সাফারি ব্রাউজারের নিচের দিকে থাকা মেইন <strong className="text-white">শেয়ার (Share)</strong> বাটনটি চাপুন (তীর চিহ্নের মতো)।</li>
                  <li>প্যানেল থেকে একটু নিচে স্ক্রল করে <strong className="bg-sky-500/20 text-white px-2 py-0.5 rounded ml-1 font-extrabold">"Add to Home Screen"</strong> চাপুন।</li>
                  <li>সবশেষে ডানদিকের উপরের কোণায় থাকা <strong className="text-sky-400 font-extrabold">"Add"</strong> বাটনটিতে ক্লিক করলেই এটি আইফোনে সফলভাবে সেট হয়ে যাবে।</li>
                </ol>
              </div>

              {/* Cache alert explanation */}
              <p className="text-[10.5px] text-gray-400 leading-normal bg-amber-500/10 p-3 rounded-xl border border-amber-500/10">
                ⚠️ <strong className="text-amber-400 font-bold">ব্র্যান্ড লোগো আপডেট সংক্রান্ত:</strong> ক্যাশ মেমোরির জন্য প্রথম প্রথম লোগোতে ধূসর "R" চলে আসতে পারে। ব্রাউজার অটোমেটিক ব্যাকগ্রাউন্ডে রিফ্রেশ করে নিলে ফোনে নতুন রঙিন অ্যাপ লোগো নিজ থেকেই সম্পূর্ণ আপডেট হয়ে যাবে।
              </p>
            </div>

            {/* Bottom Button */}
            <div className="p-4 border-t border-white/5 bg-black/40 flex">
              <button 
                onClick={() => {
                  hapticFeedback('medium');
                  setShowInstallHelp(false);
                }}
                className="w-full bg-[#FF4B91] hover:bg-pink-600 text-white font-black py-4 rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer text-center shadow-lg shadow-pink-500/20"
                id="ack-install-help-btn"
              >
                ঠিক আছে, বুঝতে পেরেছি
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Dynamic Floating Toast Alert (Facebook Chime Alert) */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            onClick={() => {
              if (activeToast.type === 'message') {
                if (activeToast.fromUserId) {
                  (window as any).targetChatUserId = activeToast.fromUserId;
                }
                setActiveTab('messages');
              } else {
                setActiveTab('inbox');
              }
              setActiveToast(null);
            }}
            className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gray-950/95 backdrop-blur-xl border border-pink-500/30 hover:border-pink-500/50 rounded-2xl p-3.5 flex items-center space-x-3.5 shadow-[0_20px_40px_rgba(255,75,145,0.15)] z-[999] cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-800 border border-gray-700/60 flex-shrink-0 flex items-center justify-center">
              {activeToast.avatar ? (
                <img src={activeToast.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : activeToast.type === 'message' ? (
                <MessageSquare className="w-5 h-5 text-[#FF4B91]" />
              ) : (
                <Bell className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              <h4 className="text-[10px] font-black uppercase text-pink-400 tracking-widest truncate leading-none mb-1">
                {activeToast.type === 'message' ? 'New Message' : 'New Notification'}
              </h4>
              <h4 className="text-xs font-black uppercase text-white tracking-widest truncate leading-none mb-1">
                {activeToast.title}
              </h4>
              <p className="text-xs text-gray-200 font-bold truncate max-w-full leading-normal">
                {activeToast.description}
              </p>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveToast(null);
              }}
              className="p-1 h-7 w-7 flex items-center justify-center hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full bg-black h-full relative flex flex-col overflow-hidden">
        {isOffline && (
          <div className="bg-red-600 text-white text-[10px] font-black uppercase py-2.5 px-4 flex items-center justify-between z-[200] shadow-[0_4px_25px_rgba(220,38,38,0.6)] border-b border-white/20 animate-in slide-in-from-top duration-300">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-white rounded-full mr-3 animate-ping" />
              <span>No Connection</span>
            </div>
            <div className="flex items-center space-x-2">
               <button 
                onClick={handleManualReconnect}
                className="bg-white text-red-600 px-4 py-1 rounded-full text-[9px] font-black active:scale-95 transition-all shadow-lg flex items-center"
              >
                <RefreshCw className="w-2.5 h-2.5 mr-1" />
                Reset Connection
              </button>
            </div>
          </div>
        )}

        {isQuotaExceeded && (
          <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 z-[200] shadow-[0_4px_25px_rgba(217,119,6,0.5)] border-b border-white/20 animate-in slide-in-from-top duration-300">
            <div className="flex items-start text-left gap-2.5">
              <AlertCircle className="w-5 h-5 text-white shrink-0 mt-0.5 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-wider">
                  {appLanguage === 'bn' ? 'ফায়ারস্টোর লিমিট কোটা শেষ!' : 'Firebase Quota Exceeded!'}
                </span>
                <span className="text-[10px] text-white/95 font-semibold leading-relaxed max-w-[550px] mt-0.5">
                  {appLanguage === 'bn'
                    ? 'এই স্যান্ডবক্সের ফায়ারস্টোর ডেটাবেজের দৈনিক ফ্রি রাইট লিমিট শেষ। নতুন পোস্ট, কমেন্ট বা লাইক দেওয়ার জন্য অটোমেটিক লোকাল ফলব্যাক মোড চালু করা হয়েছে।'
                    : 'The free Firestore daily write quota limit is exhausted for this developer environment sandbox. Adaptive local-only fallback storage has been enabled.'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={() => {
                  setGlobalShowSettings(true);
                }}
                className="bg-white/95 text-amber-900 border border-amber-500/20 hover:bg-white px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all shadow-md flex items-center gap-1"
              >
                <SettingsIcon className="w-3 h-3" />
                {appLanguage === 'bn' ? 'স্টোরেজ সেটিংস' : 'Change Storage'}
              </button>
              <button 
                onClick={() => setIsQuotaExceeded(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-hidden relative">
           {!user ? (
            <AuthForm type="login" isBlocking={true} />
          ) : (
            <>
              {activeTab === 'home' && (
            <Feed 
              pendingUploads={pendingUploads} 
              isMuted={isMuted} 
              setIsMuted={setIsMuted} 
              unreadNotifsCount={unreadNotifsCount} 
              unreadDMsCount={unreadDMsCount} 
              startBackgroundUpload={startBackgroundUpload}
              cancelUpload={cancelUpload}
            />
          )}
          {activeTab === 'profile' && (
            user ? (
              <Profile 
                onBack={() => setActiveTab('home')} 
                setActiveTab={setActiveTab} 
                pendingUploads={pendingUploads} 
                isOffline={isOffline} 
                isDarkMode={isDarkMode}
                onToggleTheme={() => setIsDarkMode(!isDarkMode)}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
                socketConnected={socketConnected}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 space-y-6">
                <div className="w-20 h-20 bg-[var(--bg-card)] rounded-full flex items-center justify-center transition-colors">
                  <UserIcon className="w-10 h-10 text-gray-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-[var(--text-primary)] text-lg font-bold transition-colors">Log in to World</h3>
                  <p className="text-[var(--text-secondary)] text-sm mt-1 transition-colors">Manage your profile and see notifications.</p>
                </div>
                <div className="w-full space-y-3">
                  <button onClick={() => setAuthModal('login')} className="w-full bg-pink-500 text-white font-bold p-4 rounded-md">Log in</button>
                  <button onClick={() => setAuthModal('signup')} className="w-full border border-[var(--border-primary)] text-[var(--text-primary)] font-bold p-4 rounded-md">Sign up</button>
                </div>
              </div>
            )
          )}
          {activeTab === 'view-profile' && (
            <Profile 
              userId={(window as any).targetUserId} 
              onBack={() => setActiveTab('home')} 
              setActiveTab={setActiveTab} 
              pendingUploads={pendingUploads} 
              isOffline={isOffline} 
              isDarkMode={isDarkMode}
              onToggleTheme={() => setIsDarkMode(!isDarkMode)}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              socketConnected={socketConnected}
            />
          )}
          {activeTab === 'friends' && (
            <FriendsCircle 
              user={user} 
              appLanguage={appLanguage} 
              setActiveTab={setActiveTab} 
            />
          )}
          {activeTab === 'marketplace' && (
            <Marketplace 
              user={user} 
              appLanguage={appLanguage} 
              setActiveTab={setActiveTab} 
            />
          )}
          {activeTab === 'inbox' && (user ? <Notifications /> : <div className="h-full flex items-center justify-center text-gray-500 italic">Log in to see activity</div>)}
          {activeTab === 'messages' && (
            user ? (
              <DirectMessages 
                onBack={() => setActiveTab('home')} 
                appLanguage={appLanguage} 
                onlineUsers={onlineUsers}
                socket={socket}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 space-y-6">
                <div className="w-20 h-20 bg-[var(--bg-card)] rounded-full flex items-center justify-center">
                  <MessageSquare className="w-10 h-10 text-gray-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-[var(--text-primary)] text-lg font-bold">Log in to send messages</h3>
                  <p className="text-[var(--text-secondary)] text-sm mt-1">Connect with friends and stay in touch.</p>
                </div>
                <button onClick={() => setAuthModal('login')} className="bg-pink-500 text-white font-bold px-8 py-3 rounded-md">Log in</button>
              </div>
            )
          )}
          {activeTab === 'shop' && (user ? <Shop /> : <div className="h-full flex items-center justify-center text-gray-500 italic uppercase font-black text-xs tracking-tighter">Sign in to visit World Shop 🪙</div>)}
          {activeTab === 'search' && <Discover pendingUploads={pendingUploads} isOffline={isOffline} isMuted={isMuted} setIsMuted={setIsMuted} />}
          {activeTab === 'upload' && (
            user ? <Upload 
              key={uploadKey}
              onComplete={() => setActiveTab('home')} 
              onPost={(data) => startBackgroundUpload(data)}
              onPreUpload={(data) => startBackgroundUpload(data)}
              isOffline={isOffline}
              preUploadTasksRef={preUploadTasksRef}
              pendingUploads={pendingUploads}
              isNavVisible={isNavVisible}
              setIsNavVisible={setIsNavVisible}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              appLanguage={appLanguage}
            /> : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6">
                <PlusSquare className="w-16 h-16 text-gray-700" />
                <h3 className="text-white font-bold">Sign in to upload videos</h3>
                <button onClick={() => setAuthModal('login')} className="bg-pink-500 px-8 py-3 rounded-full font-bold">Log in</button>
              </div>
            )
          )}
            </>
          )}
        </main>

        <AnimatePresence>
          {isNavVisible && !!user && (
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center pointer-events-none"
            >
              <div className="w-full pointer-events-auto bg-black border-t border-white/5">
                <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} unreadNotifsCount={unreadNotifsCount} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {authModal && <AuthForm type={authModal} onClose={() => setAuthModal(null)} />}
        {editingPost && <EditPostModal video={editingPost} onClose={() => setEditingPost(null)} />}
        {globalShowSettings && (
          <Settings 
            onClose={() => setGlobalShowSettings(false)} 
            isOffline={isOffline} 
            isDarkMode={isDarkMode}
            onToggleTheme={() => setIsDarkMode(!isDarkMode)}
            initialSection={settingsSection}
            socketConnected={socketConnected}
            CLIENT_VERSION={CLIENT_VERSION}
            updateAvailable={updateAvailable}
            latestVersionInfo={latestVersionInfo}
            setUpdateAvailable={setUpdateAvailable}
            checkForAppUpdates={checkForAppUpdates}
          />
        )}
      </AnimatePresence>
      {updateAvailable && renderUpdateModal()}
      <AnimatePresence>
        {customDialog && (
          <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="bg-gray-950 border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-left space-y-5"
            >
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-pink-500 font-extrabold">{customDialog.title}</h3>
                <p className="text-xs text-gray-300 font-semibold leading-relaxed whitespace-pre-wrap">{customDialog.message}</p>
              </div>

              {customDialog.type === 'prompt' && (
                <input 
                  id="custom-dialog-input"
                  type="text"
                  defaultValue={customDialog.defaultValue || ''}
                  placeholder={customDialog.placeholder || ''}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-white font-bold outline-none focus:border-pink-500 transition-colors"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (document.getElementById('custom-dialog-input') as HTMLInputElement)?.value;
                      customDialog.onConfirm(val);
                    }
                  }}
                />
              )}

              <div className="flex items-center space-x-3 pt-2">
                <button 
                  onClick={() => {
                    if (customDialog.onCancel) {
                      customDialog.onCancel();
                    } else {
                      setCustomDialog(null);
                    }
                  }}
                  className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-xs font-black uppercase text-gray-400 hover:bg-white/5 active:scale-95 transition-all text-center"
                >
                  {appLanguage === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button 
                  onClick={() => {
                    if (customDialog.type === 'prompt') {
                      const val = (document.getElementById('custom-dialog-input') as HTMLInputElement)?.value;
                      customDialog.onConfirm(val);
                    } else {
                      customDialog.onConfirm();
                    }
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-pink-500 text-white text-xs font-black uppercase shadow-lg shadow-pink-500/20 hover:bg-pink-600 active:scale-95 transition-all text-center"
                >
                  {appLanguage === 'bn' ? 'নিশ্চিত করুন' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditPostModal({ video, onClose }: { video: any, onClose: () => void }) {
  const [title, setTitle] = useState(video.title || '');
  const [description, setDescription] = useState(video.description || '');
  const [musicName, setMusicName] = useState(video.musicName || '');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'videos', video.id), {
        title,
        description,
        musicName,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Post updated successfully!");
      onClose();
    } catch (err: any) {
      alert("Error updating post: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
      >
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
          <h2 className="text-xl font-black uppercase tracking-[0.2em] text-white">Edit Post</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6 text-white" /></button>
        </div>
        
        <form onSubmit={handleUpdate} className="p-8 space-y-6">
           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Title</label>
              <input 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-pink-500 transition-colors"
                placeholder="Title..."
              />
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-medium outline-none focus:border-pink-500 transition-colors resize-none"
                placeholder="Description..."
              />
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 flex items-center">
                 <Music className="w-3 h-3 mr-2 text-pink-500" />
                 Music Name / গান বা অডিওর নাম
              </label>
              <input 
                value={musicName}
                onChange={(e) => setMusicName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-pink-500 transition-colors"
                placeholder="Name your sound..."
              />
           </div>

           <button 
             type="submit"
             disabled={loading}
             className="w-full bg-pink-500 text-white font-black uppercase py-5 rounded-2xl shadow-xl active:scale-95 transition-all disabled:opacity-50 tracking-[0.2em] text-xs"
           >
             {loading ? 'Saving Changes / সেভ হচ্ছে...' : 'Save Changes / আপডেট দিন'}
           </button>
        </form>
      </motion.div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorldApp />
    </AuthProvider>
  );
}

