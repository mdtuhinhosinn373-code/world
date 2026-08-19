import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  UserPlus, 
  UserMinus, 
  CheckCircle2, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface FriendsCircleProps {
  user: any;
  appLanguage: string;
  setActiveTab: (tab: string) => void;
}

export default function FriendsCircle({ user, appLanguage, setActiveTab }: FriendsCircleProps) {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchUsersAndFollowing = async () => {
      setLoading(true);
      try {
        // Fetch newest users
        const usersQuery = query(
          collection(db, 'users'), 
          orderBy('createdAt', 'desc'), 
          limit(50)
        );
        const usersSnap = await getDocs(usersQuery);
        
        let fetchedUsers = usersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          isFollowing: false
        })).filter(u => u.id !== user.uid && u.id !== user.id);

        // Fetch user's following list
        const followingRef = collection(db, 'users', user.uid || user.id, 'following');
        const followingSnap = await getDocs(followingRef);
        const followingIds = new Set(followingSnap.docs.map(doc => doc.id));

        fetchedUsers = fetchedUsers.map(u => ({
          ...u,
          isFollowing: followingIds.has(u.id)
        }));

        setUsersList(fetchedUsers);
      } catch (err) {
        console.error("Error fetching users/following: ", err);
        // Fallback fetch inside users without orderBy (in case some older users don't have createdAt and throws Firestore index error)
        try {
          const fallbackQuery = query(collection(db, 'users'), limit(50));
          const fallbackSnap = await getDocs(fallbackQuery);
          let fetchedFallback = fallbackSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            isFollowing: false
          })).filter(u => u.id !== user.uid && u.id !== user.id);

          const followingRef = collection(db, 'users', user.uid || user.id, 'following');
          const followingSnap = await getDocs(followingRef);
          const followingIds = new Set(followingSnap.docs.map(doc => doc.id));

          fetchedFallback = fetchedFallback.map(u => ({
            ...u,
            isFollowing: followingIds.has(u.id)
          }));
          setUsersList(fetchedFallback);
        } catch (fallbackErr) {
          console.error("Fallback fetch failed as well", fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUsersAndFollowing();
  }, [user]);

  const toggleFollowUser = async (targetUser: any) => {
    const currentUserId = user.uid || user.id;
    if (!currentUserId) return;

    const previousState = targetUser.isFollowing;
    const nextState = !previousState;

    // Optimistic UI updates
    setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, isFollowing: nextState } : u));

    try {
      const followDocRef = doc(db, 'users', currentUserId, 'following', targetUser.id);
      if (nextState) {
        await setDoc(followDocRef, {
          createdAt: new Date().toISOString()
        });
      } else {
        await deleteDoc(followDocRef);
      }
    } catch (err) {
      console.error("Error following user: ", err);
      // Rollback
      setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, isFollowing: previousState } : u));
    }
  };

  const handleViewProfile = (userId: string) => {
    (window as any).targetUserId = userId;
    setActiveTab('view-profile');
  };

  const filteredUsers = usersList.filter(u => {
    const searchTarget = ((u.fullName || '') + ' ' + (u.bio || '')).toLowerCase();
    return searchTarget.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-full bg-[var(--bg-primary)] flex flex-col animate-in fade-in duration-300">
      {/* Premium Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-pink-500/10 rounded-xl">
            <Users className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <h1 className="text-sm font-black text-[var(--text-primary)] tracking-wide">
              {appLanguage === 'bn' ? 'বন্ধুরা পোর্টাল' : 'Friends Circle'}
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold tracking-tight">
              {appLanguage === 'bn' ? 'নতুন জয়েন করা সদস্যদের খুঁজুন' : 'Discover newly joined community members'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-500/10 rounded-full border border-amber-500/15">
          <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
          <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest leading-none">New</span>
        </div>
      </div>

      {/* Search Input Box */}
      <div className="p-4 border-b border-[var(--border-secondary)]/30 bg-[var(--bg-primary)]">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder={appLanguage === 'bn' ? 'সদস্য খুঁজুন...' : 'Search new friends...'} 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] pl-10 pr-4 py-3 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-pink-500/40 font-semibold transition-all shadow-inner placeholder-gray-500"
          />
        </div>
      </div>

      {/* Main Members List */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 pb-24 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-secondary)] animate-pulse">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 bg-zinc-800 rounded-full" />
                  <div className="space-y-2">
                    <div className="w-24 h-3.5 bg-zinc-800 rounded" />
                    <div className="w-32 h-2.5 bg-zinc-800 rounded" />
                  </div>
                </div>
                <div className="w-16 h-8 bg-zinc-800 rounded-full" />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-gray-600" />
            </div>
            <p className="text-gray-500 text-xs font-bold leading-relaxed">
              {appLanguage === 'bn' ? 'কোনো নতুন সদস্য খুঁজে পাওয়া যায়নি!' : 'No new members found registered on the system!'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[9px] uppercase text-gray-500 font-extrabold tracking-widest">
                {appLanguage === 'bn' ? `সদস্য তালিকা (${filteredUsers.length})` : `Members Pool (${filteredUsers.length})`}
              </span>
            </div>
            {filteredUsers.map((u, index) => (
              <div 
                key={`${u.id || 'usr'}-${index}`} 
                className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-secondary)]/50 flex items-center justify-between transition-all hover:border-pink-500/20 active:scale-[0.98]"
              >
                <div 
                  className="flex items-center space-x-3.5 flex-1 min-w-0 cursor-pointer"
                  onClick={() => handleViewProfile(u.id)}
                >
                  <div className="relative flex-shrink-0">
                    <img 
                      src={u.profilePhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80"} 
                      className="w-11 h-11 rounded-full object-cover border border-[var(--border-primary)]"
                      onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80" }}
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[var(--bg-card)] rounded-full" />
                  </div>
                  <div className="flex-1 min-w-0 pr-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-[var(--text-primary)] truncate leading-tight">{u.fullName || "Member"}</span>
                      {u.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[#00A1FF] fill-[#00A1FF] flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-gray-400 font-semibold truncate mt-0.5 max-w-[190px]">
                      {u.bio || `@${(u.fullName || "user").toLowerCase().replace(/\s+/g, '')}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => toggleFollowUser(u)}
                    className={`text-[9.5px] font-black px-4 py-2.5 rounded-full transition-all active:scale-95 uppercase tracking-wider select-none ${
                      u.isFollowing 
                        ? "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700" 
                        : "bg-pink-500 hover:bg-pink-600 text-white shadow-md shadow-pink-500/10"
                    }`}
                  >
                    {u.isFollowing ? (
                      <span className="flex items-center gap-1">
                        <UserMinus className="w-3 h-3" />
                        {appLanguage === 'bn' ? 'আনফলো' : 'Unfollow'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <UserPlus className="w-3 h-3" />
                        {appLanguage === 'bn' ? 'ফলো' : 'Follow'}
                      </span>
                    )}
                  </button>
                  <button 
                    onClick={() => handleViewProfile(u.id)}
                    className="p-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] hover:bg-[var(--bg-card)] text-gray-400 hover:text-white rounded-full transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
