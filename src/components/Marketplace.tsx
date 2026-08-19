import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  Search, 
  MessageSquare, 
  Tag, 
  X, 
  Upload, 
  CheckCircle,
  Clock,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  query, 
  getDocs, 
  doc, 
  deleteDoc, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import imageCompression from 'browser-image-compression';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  userId: string;
  sellerName: string;
  sellerPhoto?: string;
  createdAt: any;
}

interface MarketplaceProps {
  user: any;
  appLanguage: string;
  setActiveTab: (tab: string) => void;
}

export default function Marketplace({ user, appLanguage, setActiveTab }: MarketplaceProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Create / Upload states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const pQuery = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const pSnap = await getDocs(pQuery);
      const list = pSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(list);
    } catch (err) {
      console.error("Error fetching products from Firestore:", err);
      // Fallback in case orderBy fails due to missing index
      try {
        const fallbackQuery = query(collection(db, 'products'), limit(50));
        const pSnap = await getDocs(fallbackQuery);
        const list = pSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        setProducts(list);
      } catch (fallbackErr) {
        console.error("Fallback query failed as well:", fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newTitle.trim() || !newPrice.trim() || !newDesc.trim()) {
      alert(appLanguage === 'bn' ? 'অনুগ্রহ করে সব তথ্য দিন!' : 'Please fill in all details!');
      return;
    }

    setUploadLoading(true);
    try {
      let finalImageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80'; // fallback default image
      
      if (selectedImageFile) {
        // Compress the image aggressively to save space in Firestore and fit within 1MB payload
        const options = {
          maxSizeMB: 0.4,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(selectedImageFile, options);
        
        // Upload to Cloudinary via our backend API
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('provider', 'cloudinary');
        const cldConfigRaw = localStorage.getItem('world_cloudinary_config');
        if (cldConfigRaw) {
          formData.append('cloudinaryConfig', cldConfigRaw);
        }
        
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          
          if (response.ok) {
            const resData = await response.json();
            if (resData.url) {
              finalImageUrl = resData.url;
            } else {
              throw new Error("No URL returned from server upload API");
            }
          } else {
            throw new Error(`Upload failed with status ${response.status}`);
          }
        } catch (uploadErr) {
          console.warn("API Upload failed for Marketplace item, falling back to Base64:", uploadErr);
          // Convert the compressed file back to base64 fallback
          const base64Promise = new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(compressedFile);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
          });
          finalImageUrl = await base64Promise;
        }
      }

      const productPayload = {
        title: newTitle.trim(),
        description: newDesc.trim(),
        price: parseFloat(newPrice) || 0,
        imageUrl: finalImageUrl,
        userId: user.uid || user.id,
        sellerName: user.fullName || user.displayName || 'Anonymous Seller',
        sellerPhoto: user.profilePhoto || user.photoURL || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'products'), productPayload);
      
      // Reset form states
      setNewTitle('');
      setNewPrice('');
      setNewDesc('');
      setSelectedImageFile(null);
      setImagePreviewUrl('');
      setShowUploadModal(false);

      alert(appLanguage === 'bn' ? '✅ পণ্যটি সফলভাবে আপলোড করা হয়েছে!' : '✅ Product uploaded successfully!');
      
      // Refresh our local products catalog
      fetchProducts();
    } catch (err) {
      console.error("Error creating marketplace product: ", err);
      alert(appLanguage === 'bn' ? 'পণ্য আপলোড করতে সমস্যা হয়েছে।' : 'Failed to upload product.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(appLanguage === 'bn' ? 'আপনি কি নিশ্চিত যে এই পণ্যটি ডিলিট করতে চান?' : 'Are you sure you want to delete this product?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'products', productId));
      alert(appLanguage === 'bn' ? 'পণ্যটি ডিলিট করা হয়েছে!' : 'Product deleted successfully!');
      if (selectedProduct?.id === productId) {
        setSelectedProduct(null);
      }
      fetchProducts();
    } catch (err) {
      console.error("Error deleting product: ", err);
      alert(appLanguage === 'bn' ? 'ডিলিট করতে ব্যর্থ হয়েছে' : 'Failed to delete product');
    }
  };

  const handleInquire = (product: Product) => {
    if (!user) {
      alert(appLanguage === 'bn' ? 'অনুগ্রহ করে মেসেজ পাঠাতে লগইন করুন' : 'Please log in to send messages');
      return;
    }
    // Deep integration chat session
    (window as any).targetChatUserId = product.userId;
    setActiveTab('messages');
  };

  const filteredProducts = products.filter(p => {
    const matchStr = ((p.title || '') + ' ' + (p.description || '')).toLowerCase();
    return matchStr.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-full bg-[var(--bg-primary)] flex flex-col animate-in fade-in duration-300">
      
      {/* Premium Modular Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-rose-500/10 rounded-xl">
            <ShoppingBag className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <h1 className="text-sm font-black text-[var(--text-primary)] tracking-wide">
              {appLanguage === 'bn' ? 'মার্কেটপ্লেস' : 'Marketplace'}
            </h1>
            <p className="text-[10px] text-gray-500 font-semibold tracking-tight">
              {appLanguage === 'bn' ? 'পছন্দের পণ্য কিনুন এবং আপনার পণ্য বিক্রি করুন' : 'Buy and sell custom products instantly'}
            </p>
          </div>
        </div>

        <button 
          onClick={() => setShowUploadModal(true)}
          className="flex items-center space-x-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-2.5 rounded-full shadow-lg shadow-pink-500/10 active:scale-95 transition-all text-center leading-none"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>{appLanguage === 'bn' ? 'পণ্য যোগ করুন' : 'Add Product'}</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-[var(--border-secondary)]/30 bg-[var(--bg-primary)]">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder={appLanguage === 'bn' ? 'পণ্য সন্ধান করুন...' : 'Search listed items...'} 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] pl-10 pr-4 py-3 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-rose-500/40 font-semibold transition-all shadow-inner placeholder-gray-500"
          />
        </div>
      </div>

      {/* Products list layout */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 pb-24">
        {loading ? (
          <div className="grid grid-cols-2 gap-3.5">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-secondary)] overflow-hidden animate-pulse">
                <div className="w-full aspect-square bg-zinc-800" />
                <div className="p-3.5 space-y-2">
                  <div className="w-24 h-3.5 bg-zinc-800 rounded" />
                  <div className="w-12 h-3 bg-zinc-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-7 h-7 text-gray-600" />
            </div>
            <p className="text-gray-500 text-xs font-bold leading-relaxed">
              {appLanguage === 'bn' ? 'কোনো পণ্য খুঁজে পাওয়া যায়নি!' : 'No marketplace items found! Be the first to add one.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {filteredProducts.map((p, index) => {
              const matchesUser = p.userId === (user.uid || user.id);
              return (
                <div 
                  key={`${p.id || 'prod'}-${index}`} 
                  onClick={() => setSelectedProduct(p)}
                  className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-secondary)]/50 overflow-hidden cursor-pointer transition-all hover:border-rose-500/20 active:scale-[0.98] group flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-square w-full bg-zinc-900 border-b border-[var(--border-secondary)]/10">
                      <img 
                        src={p.imageUrl} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80" }}
                      />
                      {matchesUser && (
                        <button 
                          onClick={(e) => handleDeleteProduct(p.id, e)}
                          className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-500 text-white/80 hover:text-white rounded-full backdrop-blur-md transition-colors shadow-md border border-white/5 active:scale-90"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="p-3 text-left">
                      <h4 className="text-[11px] font-extrabold text-[var(--text-primary)] line-clamp-1 leading-tight tracking-tight uppercase">
                        {p.title}
                      </h4>
                      <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                        {p.description}
                      </p>
                    </div>
                  </div>

                  <div className="px-3 pb-3 pt-1 flex items-center justify-between">
                    <span className="text-[11.5px] font-black text-rose-500 uppercase flex items-center gap-0.5">
                      ৳ {p.price}
                    </span>
                    <span className="text-[8px] text-gray-500 font-extrabold tracking-tight truncate max-w-[70px]">
                      {p.sellerName.split(' ')[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] w-full max-w-sm rounded-3xl border border-[var(--border-primary)] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            
            {/* Image Slider / Backdrop */}
            <div className="relative w-full aspect-[4/3] bg-zinc-950 flex-shrink-0">
              <img 
                src={selectedProduct.imageUrl} 
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80" }}
              />
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-3 right-3 p-1.5 bg-black/60 text-white rounded-full hover:bg-white/10 backdrop-blur-md transition-all active:scale-95"
              >
                <X className="w-4 h-4 stroke-[3.5]" />
              </button>
            </div>

            {/* Content area */}
            <div className="p-5 overflow-y-auto no-scrollbar text-left space-y-4">
              <div>
                <span className="text-[15.5px] font-black text-rose-500 uppercase tracking-tight">
                  ৳ {selectedProduct.price}
                </span>
                <h3 className="text-sm font-black text-[var(--text-primary)] mt-1 uppercase tracking-tight leading-snug">
                  {selectedProduct.title}
                </h3>
              </div>

              <div className="bg-[var(--bg-secondary)]/50 p-3.5 rounded-2xl border border-[var(--border-secondary)]/40">
                <p className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest pl-0.5 mb-1.5">Description</p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-semibold">
                  {selectedProduct.description}
                </p>
              </div>

              {/* Seller details Card */}
              <div className="flex items-center justify-between p-3.5 bg-zinc-900/35 rounded-2xl border border-[var(--border-secondary)]/30">
                <div className="flex items-center space-x-3">
                  <img 
                    src={selectedProduct.sellerPhoto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80"} 
                    className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                    onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80" }}
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="text-[9.5px] text-gray-400 font-extrabold uppercase tracking-wider leading-none">Seller</p>
                    <p className="text-xs font-black text-white mt-0.5 leading-none">{selectedProduct.sellerName}</p>
                  </div>
                </div>

                {selectedProduct.userId !== (user.uid || user.id) ? (
                  <button 
                    onClick={() => handleInquire(selectedProduct)}
                    className="flex items-center space-x-1 bg-rose-500 hover:bg-rose-600 text-white font-black px-3.5 py-2 rounded-full text-[10px] uppercase tracking-wider transition-all active:scale-[0.95] select-none"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{appLanguage === 'bn' ? 'মেসেজ দিন' : 'Message'}</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-emerald-500 font-black uppercase tracking-wider bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/15">Your item</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Product Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] w-full max-w-sm rounded-[32px] border border-[var(--border-primary)] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 text-left flex flex-col max-h-[85vh]">
            
            <div className="px-5 py-4 border-b border-[var(--border-secondary)]/30 flex items-center justify-between bg-[var(--bg-secondary)]/50">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-rose-500" />
                {appLanguage === 'bn' ? 'নতুন পণ্য আপলোড' : 'Add New Product'}
              </h3>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 bg-zinc-900 rounded-full hover:bg-zinc-800 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadProduct} className="p-5 flex-1 overflow-y-auto no-scrollbar space-y-4">
              
              {/* Product Title is required */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest pl-1">
                  {appLanguage === 'bn' ? 'পণ্যের নাম' : 'Product Name'} *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder={appLanguage === 'bn' ? ' যেমন: iPhone 14 Pro, Bluetooth Headphone' : 'e.g. iPhone 14 Pro, Bluetooth Headphone'} 
                  value={newTitle} 
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] text-xs text-white p-3.5 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-rose-500/40 font-semibold"
                />
              </div>

              {/* Price is BDT */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest pl-1">
                  {appLanguage === 'bn' ? 'মূল্য (টাকা)' : 'Price (৳ BDT)'} *
                </label>
                <input 
                  type="number" 
                  required
                  placeholder={appLanguage === 'bn' ? 'যেমন: ৫০০০0' : 'e.g. 15000'}
                  value={newPrice} 
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] text-xs text-white p-3.5 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-rose-500/40 font-semibold"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest pl-1">
                  {appLanguage === 'bn' ? 'বিবরণ লিখুন' : 'Description Details'} *
                </label>
                <textarea 
                  required
                  rows={3}
                  placeholder={appLanguage === 'bn' ? 'পণ্যের অবস্থা, কতদিন ব্যবহার করা হয়েছে বিস্তারিত...' : 'Details about item condition, usage period, etc...'} 
                  value={newDesc} 
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] text-xs text-white p-3.5 rounded-2xl border border-[var(--border-secondary)] outline-none focus:border-rose-500/40 font-semibold leading-relaxed"
                />
              </div>

              {/* Image Input Selection */}
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest pl-1">
                  {appLanguage === 'bn' ? 'পণ্যের ছবি আপলোড' : 'Product Image'} *
                </label>

                {imagePreviewUrl ? (
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] group border border-[var(--border-primary)]">
                    <img src={imagePreviewUrl} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedImageFile(null);
                        setImagePreviewUrl('');
                      }}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-black/80 hover:bg-black text-white hover:text-red-400 rounded-full transition-colors"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-700/60 hover:border-rose-500/60 transition-colors rounded-2xl cursor-pointer bg-[var(--bg-secondary)] relative group">
                    <Upload className="w-7 h-7 text-zinc-500 group-hover:text-rose-400 transition-colors" />
                    <span className="text-[10px] font-extrabold text-zinc-400 group-hover:text-white transition-colors mt-2 uppercase tracking-wider">
                      {appLanguage === 'bn' ? 'ছবি নির্বাচন করুন' : 'Select Product Photo'}
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageChange}
                      className="hidden" 
                    />
                  </label>
                )}
              </div>

              {/* Submission buttons */}
              <div className="pt-2 flex items-center space-x-2.5">
                <button 
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="w-1/3 py-3.5 border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-white font-extrabold rounded-2xl text-[10px] uppercase tracking-wider select-none active:scale-[0.97]"
                >
                  {appLanguage === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button 
                  type="submit"
                  disabled={uploadLoading}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 disabled:opacity-50 text-white font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-wider select-none active:scale-[0.97] transition-all flex items-center justify-center space-x-2 shadow-lg shadow-pink-500/10"
                >
                  {uploadLoading ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{appLanguage === 'bn' ? 'আপলোড করুন' : 'Upload Item'}</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
