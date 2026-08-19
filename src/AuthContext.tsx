import * as React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, isFirestoreShutdownError, triggerQuotaExceeded } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot as firestoreOnSnapshot, serverTimestamp } from 'firebase/firestore';
import { User } from './types';

// Unified safe onSnapshot listener wrapper
const onSnapshot = (query: any, ...args: any[]) => {
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
      console.warn("Firestore listener in AuthSafely aborted/ignored:", err.message);
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
        console.error("Uncaught inside custom AuthContext snapshot error handler:", innerErr);
      }
    } else if (observer && observer.error) {
      try {
        observer.error(err);
      } catch (innerErr) {
        console.error("Uncaught inside custom observer AuthContext error handler:", innerErr);
      }
    } else {
      console.warn("Safe AuthContext onSnapshot caught unhandled error:", err);
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
      next: observer.next,
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
    console.warn("Error setting up safe Firestore snapshot listener in AuthContext:", err);
    return () => {};
  }
};

const safeSetDoc = async (ref: any, data: any, options?: any) => {
  try {
    await setDoc(ref, data, options);
  } catch (err: any) {
    console.warn("Firestore setDoc encountered error:", err);
    const msg = err?.message || err?.toString() || '';
    if (err?.code === 'resource-exhausted' || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
    } else {
      throw err;
    }
  }
};

const safeUpdateDoc = async (ref: any, data: any) => {
  try {
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(ref, data);
  } catch (err: any) {
    console.warn("Firestore updateDoc encountered error:", err);
    const msg = err?.message || err?.toString() || '';
    if (err?.code === 'resource-exhausted' || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
    } else {
      throw err;
    }
  }
};

interface AuthContextType {
  user: User | null;
  emailVerified: boolean;
  loading: boolean;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  updateUserProfile?: (newData: Partial<User>) => Promise<void>;
  sessionId?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('world_local_user_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [sessionId, setSessionId] = useState<string>('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setEmailVerified(auth.currentUser.emailVerified);
    }
  };

  const updateUserProfile = async (newData: Partial<User>) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    let updatedUser: User | null = null;
    setUser(prev => {
      // If we don't have a previous user state, build one on the fly from current user details
      const base = prev || { id: uid, email: auth.currentUser?.email || '', fullName: auth.currentUser?.displayName || '', coinBalance: 0, isVerified: false };
      updatedUser = { ...base, ...newData } as User;
      try {
        localStorage.setItem('world_local_user_profile', JSON.stringify(updatedUser));
      } catch (err) {}
      return updatedUser;
    });

    // 1. Immediate SQLite Sync in the background to ensure parity
    try {
      await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uid,
          fullName: newData.fullName !== undefined ? newData.fullName : (updatedUser ? (updatedUser as any).fullName : ''),
          profilePhoto: newData.profilePhoto !== undefined ? newData.profilePhoto : (updatedUser ? (updatedUser as any).profilePhoto : ''),
          bio: newData.bio !== undefined ? newData.bio : (updatedUser ? (updatedUser as any).bio : ''),
          coinBalance: updatedUser ? (updatedUser as any).coinBalance : 0,
          isVerified: updatedUser ? (updatedUser as any).isVerified : false,
          isOnline: true,
          lastActive: new Date().toISOString(),
          isProMode: updatedUser ? (updatedUser as any).isProMode : false
        })
      });
    } catch (e) {
      console.warn("SQLite sync failed during updateUserProfile:", e);
    }

    // 2. Immediate Firestore Set
    try {
      if (typeof window !== 'undefined' && !(window as any).firestoreQuotaExceeded) {
        const userRef = doc(db, 'users', uid);
        await safeSetDoc(userRef, newData, { merge: true });
      }
    } catch (fsErr) {
      console.warn("Firestore updateUserProfile sync error:", fsErr);
    }

    // 3. Firebase Auth displayName/photoURL update
    try {
      const { updateProfile } = await import('firebase/auth');
      const profileUpdates: any = {};
      if (newData.fullName) profileUpdates.displayName = newData.fullName;
      if (newData.profilePhoto) profileUpdates.photoURL = newData.profilePhoto;
      
      if (Object.keys(profileUpdates).length > 0) {
        await updateProfile(auth.currentUser, profileUpdates);
      }
    } catch (authErr) {
      console.warn("Auth displayName/photoURL update failed:", authErr);
    }
  };

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubSession: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      if (unsubSession) {
        unsubSession();
        unsubSession = null;
      }

      if (firebaseUser) {
        setLoading(true);
        setEmailVerified(firebaseUser.emailVerified);

        // Get or generate Session ID
        let currentSessId = localStorage.getItem('app_session_id');
        if (!currentSessId) {
          currentSessId = Math.random().toString(36).substring(2, 11) + '_' + Date.now();
          localStorage.setItem('app_session_id', currentSessId);
        }
        setSessionId(currentSessId);

        // Parse human-friendly Device Name from user agent with high precision
        const getDeviceName = () => {
          const ua = navigator.userAgent;
          
          if (/iPhone/i.test(ua)) {
            return "iPhone";
          }
          if (/iPad/i.test(ua)) {
            return "iPad";
          }
          if (/iPod/i.test(ua)) {
            return "iPod";
          }
          
          if (/android/i.test(ua)) {
            let model = "";
            const parenMatch = ua.match(/\(([^)]+)\)/);
            if (parenMatch && parenMatch[1]) {
              const tokens = parenMatch[1].split(';');
              for (const tok of tokens) {
                const t = tok.trim();
                if (!t) continue;
                if (/^(linux|android|wv|u|k|m|chrome|safari|version|mobile|build|platform|en-|bn-|zh-)/i.test(t)) {
                  continue;
                }
                let cleaned = t;
                if (/build\//i.test(cleaned)) {
                  cleaned = cleaned.split(/build\//i)[0].trim();
                }
                if (cleaned && cleaned.length > 2 && isNaN(Number(cleaned))) {
                  model = cleaned;
                  break;
                }
              }
            }
            
            if (!model) {
              const match1 = ua.match(/Android\s+[^;]+;\s+([^;)]+)/);
              if (match1 && match1[1]) {
                const candidate = match1[1].split(/build\//i)[0].trim();
                if (candidate && candidate.length > 2 && candidate !== 'K' && candidate !== 'wv') {
                  model = candidate;
                }
              }
            }
            
            if (model) {
              let brandPrefix = "";
              const lowerModel = model.toLowerCase();
              if (lowerModel.startsWith("sm-")) {
                brandPrefix = "Samsung ";
              } else if (lowerModel.startsWith("cph") || lowerModel.startsWith("pcfm") || lowerModel.startsWith("pd") || lowerModel.startsWith("pe") || lowerModel.startsWith("pg")) {
                brandPrefix = "OPPO ";
              } else if (lowerModel.startsWith("v2") || lowerModel.startsWith("v1") || lowerModel.startsWith("v3")) {
                brandPrefix = "Vivo ";
              } else if (lowerModel.startsWith("rmx")) {
                brandPrefix = "Realme ";
              } else if (lowerModel.startsWith("pixel")) {
                brandPrefix = "Google ";
              } else if (lowerModel.startsWith("m2") || lowerModel.startsWith("22") || lowerModel.startsWith("21") || lowerModel.startsWith("23")) {
                if (!/xiaomi|redmi|poco/i.test(ua)) {
                  brandPrefix = "Xiaomi/Redmi ";
                }
              }
              
              let finalModel = brandPrefix + model;
              finalModel = finalModel.replace(/;\s*wv/i, '').trim();
              if (finalModel.length > 2) {
                return finalModel;
              }
            }
            
            const brandKeywords = [
              { name: "Samsung", regex: /samsung/i },
              { name: "Redmi", regex: /redmi/i },
              { name: "Xiaomi", regex: /xiaomi/i },
              { name: "Poco", regex: /poco/i },
              { name: "Oppo", regex: /oppo/i },
              { name: "Vivo", regex: /vivo/i },
              { name: "Realme", regex: /realme/i },
              { name: "OnePlus", regex: /oneplus/i },
              { name: "Huawei", regex: /huawei/i },
              { name: "Pixel", regex: /pixel/i },
              { name: "Infinix", regex: /infinix/i },
              { name: "Tecno", regex: /tecno/i },
              { name: "Moto", regex: /moto|motorola/i },
              { name: "Sony", regex: /sony|xperia/i },
              { name: "HTC", regex: /htc/i },
              { name: "Lenovo", regex: /lenovo/i },
              { name: "Asus", regex: /asus|rog/i }
            ];
            
            for (const b of brandKeywords) {
              if (b.regex.test(ua)) {
                return b.name + " Phone";
              }
            }
            
            return "Android Phone";
          }
          
          if (/Macintosh/i.test(ua)) return "MacBook / iMac (OS X)";
          if (/Windows/i.test(ua)) {
            if (/Chrome/i.test(ua)) return "Windows PC (Chrome)";
            if (/Edge/i.test(ua)) return "Windows PC (Edge)";
            if (/Firefox/i.test(ua)) return "Windows PC (Firefox)";
            return "Windows PC";
          }
          if (/Linux/i.test(ua)) return "Linux PC";
          return "Mobile App (Web)";
        };

        // Fetch IP address and write session asynchronously in the background to prevent app blockage
        (async () => {
          let detectedIp = 'Unknown IP';
          try {
            const res = await Promise.race([
              fetch('https://api.ipify.org?format=json').then(r => r.json()),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]);
            if (res && res.ip) {
              detectedIp = res.ip;
            }
          } catch (ipErr) {
            console.warn("Could not determine client IP with ipify:", ipErr);
            try {
              const res2 = await fetch('https://ipapi.co/json/').then(r => r.json());
              if (res2 && res2.ip) {
                detectedIp = res2.ip;
              }
            } catch (altErr) {
              console.warn("Alternative IP API failed:", altErr);
            }
          }

          const currentDeviceName = getDeviceName();
          const sessionRef = doc(db, 'users', firebaseUser.uid, 'sessions', currentSessId);
          
          try {
            await safeSetDoc(sessionRef, {
              id: currentSessId,
              ip: detectedIp,
              deviceName: currentDeviceName,
              userAgent: navigator.userAgent,
              lastActive: serverTimestamp(),
              createdAt: serverTimestamp()
            }, { merge: true });
          } catch (dbErr) {
            console.error("Failed to register user session in background:", dbErr);
          }
        })();

        // Set up snapshot listener on current session to force logout if session deleted remotely
        const sessionRef = doc(db, 'users', firebaseUser.uid, 'sessions', currentSessId);
        unsubSession = onSnapshot(sessionRef, (snap: any) => {
          if (!snap.exists() && !snap.metadata.fromCache) {
            console.warn("This device's session has been terminated remotely from user settings.");
            auth.signOut();
          }
        }, (sessErr) => {
          console.warn("Session snapshot listener encountered error:", sessErr);
        });

        // Sync with Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for real-time user updates
        unsubUser = onSnapshot(userRef, (docSnap) => {
          let uData: any;
          if (docSnap.exists()) {
            uData = { id: docSnap.id, ...docSnap.data() } as User;
          } else {
            // Profile doesn't exist yet, but Auth does
            uData = { 
              id: firebaseUser.uid, 
              email: firebaseUser.email || '',
              fullName: firebaseUser.displayName || '',
              coinBalance: 0,
              isVerified: false
            } as User;
          }
          setUser(uData);
          // Cache the real-time profile data to localStorage so it is instantly available on reload (prevents flickering or reverting profiles)
          try {
            localStorage.setItem('world_local_user_profile', JSON.stringify(uData));
          } catch (e) {
            console.error("Failed to cache world_local_user_profile on snapshot:", e);
          }
          // Sync to SQLite fallback database
          fetch('/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: uData.id,
              fullName: uData.fullName || '',
              profilePhoto: uData.profilePhoto || '',
              bio: uData.bio || '',
              coinBalance: uData.coinBalance || 0,
              isVerified: uData.isVerified || false,
              isOnline: uData.isOnline || false,
              lastActive: new Date().toISOString(),
              isProMode: uData.isProMode || false
            })
          }).catch(e => console.log("User server sync not active:", e));
          
          setLoading(false);
        }, (err) => {
          if (!isFirestoreShutdownError(err)) {
            console.error("Auth user snapshot error:", err);
          }
          const uData = { 
            id: firebaseUser.uid, 
            email: firebaseUser.email || '',
            fullName: firebaseUser.displayName || '',
            coinBalance: 0,
            isVerified: false,
            isProMode: false
          } as User;
          setUser(uData);
          fetch('/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: uData.id,
              fullName: uData.fullName || '',
              profilePhoto: uData.profilePhoto || '',
              bio: uData.bio || '',
              coinBalance: uData.coinBalance || 0,
              isVerified: uData.isVerified || false,
              isOnline: uData.isOnline || false,
              lastActive: new Date().toISOString(),
              isProMode: false
            })
          }).catch(e => console.log("User server sync not active:", e));
          setLoading(false);
        });
      } else {
        setUser(null);
        setSessionId('');
        setEmailVerified(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubUser) unsubUser();
      if (unsubSession) unsubSession();
    };
  }, []);

  // Real-time online status heartbeat loop
  useEffect(() => {
    if (!user?.id) return;

    let heartbeatInterval: any;

    const setOnlineStatus = async (online: boolean) => {
      try {
        const userRef = doc(db, 'users', user.id);
        await safeUpdateDoc(userRef, {
          isOnline: online,
          lastActive: serverTimestamp()
        });
      } catch (e) {
        // Safe check in case profile isn't fully created yet in DB
        console.warn("Could not sync online state:", e);
      }
    };

    // Set online immediately
    setOnlineStatus(true);

    // Dynamic heartbeat check every 35 seconds to keep connection alive
    heartbeatInterval = setInterval(() => {
      setOnlineStatus(true);
    }, 35000);

    const handleBeforeUnload = () => {
      // Best-effort to switch offline on window closing
      if (typeof window !== "undefined" && (window as any).firestoreQuotaExceeded) return;
      try {
        const { updateDoc } = require('firebase/firestore');
        const userRef = doc(db, 'users', user.id);
        updateDoc(userRef, { isOnline: false });
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Best-effort mark offline when logging out or changing sessions
      setOnlineStatus(false);
    };
  }, [user?.id]);

  const logout = async () => {
    try {
      if (user?.id) {
        // Run cleanups as completely non-blocking background tasks with short timeout guards so they can never freeze logout
        const runBackgroundCleanups = async () => {
          try {
            const userRef = doc(db, 'users', user.id);
            await Promise.race([
              safeUpdateDoc(userRef, { isOnline: false }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
            ]);
          } catch (e) {
            console.warn("Offline status cleanup timed out or failed:", e);
          }

          try {
            if (typeof window !== 'undefined' && !(window as any).firestoreQuotaExceeded) {
              const { deleteDoc, doc: fsDoc } = await import('firebase/firestore');
              const currentSessId = localStorage.getItem('app_session_id');
              if (currentSessId) {
                const sessionRef = fsDoc(db, 'users', user.id, 'sessions', currentSessId);
                await Promise.race([
                  deleteDoc(sessionRef),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
                ]);
              }
            }
          } catch (e) {
            console.warn("Session cleanup timed out or failed:", e);
          }
        };

        runBackgroundCleanups().catch(err => {
          console.warn("Logout background cleanup error:", err);
        });
      }
    } catch (e) {
      console.warn("Logout nested error:", e);
    } finally {
      try {
        localStorage.removeItem('app_session_id');
        localStorage.removeItem('firestore_quota_exceeded');
      } catch (lsErr) {
        console.error("Local storage error during logout:", lsErr);
      }
      try {
        await auth.signOut();
      } catch (signOutErr) {
        console.error("Firebase signOut failed:", signOutErr);
      }
      // Guarantee high-speed full-state refresh to destroy any active/stale views or memory leaks
      try {
        window.location.reload();
      } catch (reloadErr) {
        console.error("Failed to reload page:", reloadErr);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, emailVerified, loading, logout, refreshAuth, updateUserProfile, sessionId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
