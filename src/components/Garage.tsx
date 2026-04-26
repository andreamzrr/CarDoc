import logo from '../logo.png';
import { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Car, 
  History, 
  Calendar, 
  ChevronRight, 
  Database,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Search,
  ScanLine,
  Timer,
  Camera,
  Upload,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, IS_FIREBASE_REAL } from '../lib/firebase';
import { useAuth } from '../lib/hooks';
import { playSound } from '../lib/sounds';
import { getVehicleByVin } from '../lib/nhtsa';
import { getCarImage } from '../lib/gemini';
import { useRef } from 'react';

interface Vehicle {
  id: string;
  year: string;
  make: string;
  model: string;
  mileage: number;
  photoUrl?: string;
  vin?: string;
  trim?: string;
  series?: string;
  bodyClass?: string;
}

interface MaintenanceRecord {
  id: string;
  serviceName: string;
  mileage: number;
  date: any;
  notes?: string;
}

interface MaintenanceForecast {
  mileage: number;
  task: string;
  urgency: 'low' | 'medium' | 'high';
  estimatedCost: string;
}

interface GarageProps {
  onService: (car: string, year: string, mileage: string) => void;
  onDiagnose: (car: string) => void;
  theme: 'dark' | 'light';
}

export function Garage({ onService, onDiagnose, theme }: GarageProps) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVehicle, setNewVehicle] = useState<{ year: string, make: string, model: string, mileage: string, vin: string, photoUrl?: string }>({ year: '', make: '', model: '', mileage: '', vin: '', photoUrl: '' });
  const [decoding, setDecoding] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [forecasts, setForecasts] = useState<MaintenanceForecast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Generate dummy forecasts based on mileage for the UI
    if (selectedVehicle) {
      const baseMileage = selectedVehicle.mileage;
      const fakeForecasts: MaintenanceForecast[] = [
        { mileage: baseMileage + 3000, task: 'Oil & Filter Change', urgency: 'medium' as const, estimatedCost: '$60 - $90' },
        { mileage: baseMileage + 15000, task: 'Transmission Flush', urgency: 'low' as const, estimatedCost: '$150 - $250' },
        { mileage: baseMileage + 2000, task: 'Brake Inspection', urgency: 'high' as const, estimatedCost: '$0 (DIY)' },
      ].sort((a, b) => a.mileage - b.mileage);
      setForecasts(fakeForecasts);
    }
  }, [selectedVehicle]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // More generous initial limit
        alert("File size must be less than 10MB");
        return;
      }
      setImageProcessing(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const sizeInBytes = Math.round((dataUrl.length * 3) / 4);
          
          if (sizeInBytes > 900000) {
            const moreCompressed = canvas.toDataURL('image/jpeg', 0.6);
            setNewVehicle(prev => ({ ...prev, photoUrl: moreCompressed }));
          } else {
            setNewVehicle(prev => ({ ...prev, photoUrl: dataUrl }));
          }
          setImageProcessing(false);
        };
        img.onerror = () => {
          setImageProcessing(false);
          alert("Failed to process image");
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!user) return;

    if (!IS_FIREBASE_REAL) {
      const savedVehicles = localStorage.getItem('cardoc_vehicles');
      if (savedVehicles) {
        try {
          const parsed = JSON.parse(savedVehicles);
          // Filter by current user if we want multi-user simulation, 
          // though usually local storage is per-browser instance.
          setVehicles(parsed.filter((v: any) => v.ownerId === user.uid));
        } catch (e) {
          console.error("Parse error", e);
          setVehicles([]);
        }
      }
      setLoading(false);
      return;
    }

    const vQuery = query(
      collection(db, 'vehicles'), 
      where('ownerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(vQuery, (snapshot) => {
      const vList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[];
      setVehicles(vList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!selectedVehicle) return;

    if (!IS_FIREBASE_REAL) {
      const savedLogs = localStorage.getItem(`cardoc_logs_${selectedVehicle.id}`);
      if (savedLogs) {
        setRecords(JSON.parse(savedLogs));
      }
      return;
    }

    const rQuery = query(
      collection(db, 'vehicles', selectedVehicle.id, 'logs'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(rQuery, (snapshot) => {
      const rList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MaintenanceRecord[];
      setRecords(rList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `vehicles/${selectedVehicle.id}/logs`);
    });

    return unsubscribe;
  }, [selectedVehicle]);

  const handleVinDecode = async () => {
    if (!newVehicle.vin || newVehicle.vin.length < 11) return;
    setDecoding(true);
    try {
      const data = await getVehicleByVin(newVehicle.vin);
      if (data.year) {
        // Construct detailed model name
        const fullModel = [data.model, data.series, data.trim].filter(Boolean).join(' ');
        
        setNewVehicle(prev => ({
          ...prev,
          year: data.year,
          make: data.make,
          model: data.model,
          trim: data.trim,
          series: data.series,
          bodyClass: data.bodyClass
        }));
        
        // Auto-fetch professional image
        const fullModelForDisplay = [data.model, data.series, data.trim].filter(Boolean).join(' ');
        if (!newVehicle.photoUrl) {
          const imgUrl = await getCarImage(`${data.year} ${data.make} ${fullModelForDisplay}`);
          if (imgUrl) {
             setNewVehicle(prev => ({ ...prev, photoUrl: imgUrl }));
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDecoding(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Ensure we have at least a VIN or the basic vehicle info
    if (!newVehicle.vin && (!newVehicle.year || !newVehicle.make || !newVehicle.model)) {
      alert("Please provide either a VIN or the Vehicle Year, Make, and Model.");
      return;
    }

    setSaving(true);
    try {
      if (!IS_FIREBASE_REAL) {
        const id = Math.random().toString(36).substring(7);
        const vehicle = {
          id,
          ...newVehicle,
          mileage: parseInt(newVehicle.mileage) || 0,
          ownerId: user.uid,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        
        const currentVehicles = JSON.parse(localStorage.getItem('cardoc_vehicles') || '[]');
        const updated = [...currentVehicles, vehicle];
        localStorage.setItem('cardoc_vehicles', JSON.stringify(updated));
        
        // Update local state by filtering for the current user
        setVehicles(updated.filter(v => v.ownerId === user.uid));
        
        // Also initialize empty logs for the new vehicle
        localStorage.setItem(`cardoc_logs_${id}`, JSON.stringify([]));
        playSound('success');
      } else {
        await addDoc(collection(db, 'vehicles'), {
          ...newVehicle,
          mileage: parseInt(newVehicle.mileage) || 0,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });
        playSound('success');
      }
      setNewVehicle({ year: '', make: '', model: '', mileage: '', vin: '', photoUrl: '' });
      setShowAddForm(false);
    } catch (error) {
      if (IS_FIREBASE_REAL) {
        handleFirestoreError(error, OperationType.CREATE, 'vehicles');
      } else {
        console.error("Local save error:", error);
      }
    } finally {
      setSaving(false);
    }
  };

  const [showLogForm, setShowLogForm] = useState(false);
  const [newLog, setNewLog] = useState({ serviceName: '', mileage: '', date: new Date().toISOString().split('T')[0], notes: '' });

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !user) return;
    setLoading(true);
    try {
      if (!IS_FIREBASE_REAL) {
        const id = Math.random().toString(36).substring(7);
        const log = {
          id,
          ...newLog,
          mileage: parseInt(newLog.mileage) || 0,
          date: { seconds: Math.floor(new Date(newLog.date).getTime() / 1000) } // Simulate Firebase Timestamp
        };
        const updated = [log, ...records];
        setRecords(updated);
        localStorage.setItem(`cardoc_logs_${selectedVehicle.id}`, JSON.stringify(updated));
        playSound('success');
      } else {
        await addDoc(collection(db, 'vehicles', selectedVehicle.id, 'logs'), {
          ...newLog,
          mileage: parseInt(newLog.mileage) || 0,
          date: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        playSound('success');
      }
      setNewLog({ serviceName: '', mileage: '', date: new Date().toISOString().split('T')[0], notes: '' });
      setShowLogForm(false);
    } catch (error) {
      if (IS_FIREBASE_REAL) {
        handleFirestoreError(error, OperationType.CREATE, `vehicles/${selectedVehicle.id}/logs`);
      } else {
        console.error("Local log save error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);

  const handleDeleteVehicle = async (id: string) => {
    setLoading(true);
    try {
      if (!IS_FIREBASE_REAL) {
        const updated = vehicles.filter(v => v.id !== id);
        setVehicles(updated);
        localStorage.setItem('cardoc_vehicles', JSON.stringify(updated));
        // Cleanup logs
        localStorage.removeItem(`cardoc_logs_${id}`);
      } else {
        await deleteDoc(doc(db, 'vehicles', id));
      }
      if (selectedVehicle?.id === id) setSelectedVehicle(null);
      setVehicleToDelete(null);
    } catch (error) {
      if (IS_FIREBASE_REAL) {
        handleFirestoreError(error, OperationType.DELETE, `vehicles/${id}`);
      } else {
        console.error("Local delete error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20 space-y-4">
        <Database className="w-16 h-16 text-zinc-800 mx-auto" />
        <h2 className="text-2xl font-black uppercase tracking-tighter italic">Garage Locked</h2>
        <p className="text-zinc-500 max-w-sm mx-auto text-sm italic">Please sign in with Google to access your virtual garage and service history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedVehicle && (
            <button 
              onClick={() => setSelectedVehicle(null)}
              title="Return to Garage List"
              className={`p-2 rounded-xl transition-all border ${
                theme === 'dark' ? 'bg-zinc-900 border-white/10 hover:bg-zinc-800' : 'bg-white border-brand/10 hover:bg-brand/5 shadow-sm'
              }`}
            >
              <ArrowLeft className={`w-5 h-5 ${theme === 'dark' ? 'text-zinc-400' : 'text-brand/60'}`} />
            </button>
          )}
          <div>
            <h2 className={`text-3xl font-black tracking-tighter uppercase italic text-glow ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>
              {selectedVehicle ? (
                selectedVehicle.make ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : `VIN: ${selectedVehicle.vin}`
              ) : "My Garage"}
            </h2>
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] italic ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>
              {selectedVehicle ? "Maintenance Hub" : "Fleet Management"}
            </p>
          </div>
        </div>
        {!selectedVehicle && !showAddForm ? (
          <button 
            onClick={() => setShowAddForm(true)}
            title="Add a new vehicle to your garage"
            className="flex items-center gap-2 bg-brand hover:bg-brand/90 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-white shadow-lg shadow-brand/20 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add Vehicle
          </button>
        ) : selectedVehicle && (
          <button 
            onClick={() => setVehicleToDelete(selectedVehicle.id)}
            title="Delete this vehicle"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              theme === 'dark' 
                ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' 
                : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-600 hover:text-white'
            } shadow-sm active:scale-95`}
          >
            <Trash2 className="w-4 h-4" /> 
            <span className="hidden sm:inline">Remove Vehicle</span>
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {vehicleToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`max-w-md w-full p-8 rounded-[2.5rem] border shadow-2xl ${
                theme === 'dark' ? 'bg-zinc-900 border-white/10' : 'bg-white border-brand/10'
              }`}
            >
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h3 className={`text-xl font-black uppercase italic tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Confirm Removal</h3>
                  <p className="text-zinc-500 text-sm font-medium">Are you sure you want to remove this vehicle from your virtual garage? This action is permanent.</p>
                </div>
                <div className="flex gap-4 w-full">
                  <button 
                    onClick={() => setVehicleToDelete(null)}
                    className={`flex-1 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                      theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleDeleteVehicle(vehicleToDelete)}
                    disabled={loading}
                    className="flex-1 py-4 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-red-600 transition-all shadow-xl shadow-red-500/20 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Remove Permanently"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAddForm && !selectedVehicle ? (
          <motion.form 
            key="add-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleAddVehicle}
            className={`${theme === 'dark' ? 'bg-zinc-900/50 border-white/5 shadow-2xl' : 'bg-white border-brand/10 shadow-xl shadow-brand/5'} p-8 rounded-3xl border space-y-6 relative overflow-hidden transition-colors duration-300`}
          >
            <div className={`absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 ${theme === 'dark' ? 'bg-brand/10' : 'bg-brand/5'} blur-[80px] rounded-full`} />
            
            <div className="space-y-1 relative">
              <label className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>Vehicle Identification Number (VIN)</label>
              <div className="flex gap-2">
                <div className="relative flex-grow">
                  <input 
                    type="text" 
                    placeholder="17-character VIN"
                    className={`w-full bg-black/5 rounded-xl px-4 py-3 border outline-none font-mono text-sm uppercase transition-all ${
                        theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'
                    }`}
                    value={newVehicle.vin}
                    onChange={e => setNewVehicle({...newVehicle, vin: e.target.value.toUpperCase()})}
                  />
                  {decoding && <Loader2 className="absolute right-4 top-3.5 w-4 h-4 animate-spin text-brand" />}
                </div>
                <button 
                  type="button"
                  onClick={handleVinDecode}
                  title="Decode VIN for technical details"
                  disabled={decoding || !newVehicle.vin || newVehicle.vin.length < 11}
                  className={`${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-brand/5 hover:bg-brand/10'} px-5 rounded-xl transition-all shadow-sm`}
                >
                  <ScanLine className="w-5 h-5 text-brand" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Model Year', placeholder: '2023', key: 'year', type: 'text' },
                { label: 'Make', placeholder: 'Audi', key: 'make', type: 'text' },
                { label: 'Model', placeholder: 'RS6 Avant', key: 'model', type: 'text' },
                { label: 'Current Mileage', placeholder: '12000', key: 'mileage', type: 'number' },
              ].map((field) => (
                <div key={field.key} className="space-y-1 relative">
                  <label className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>{field.label}</label>
                  <input 
                    type={field.type}
                    placeholder={field.placeholder}
                    className={`w-full bg-black/5 rounded-xl px-4 py-3 border outline-none transition-all ${
                        theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'
                    }`}
                    value={(newVehicle as any)[field.key]}
                    onChange={e => setNewVehicle({...newVehicle, [field.key]: e.target.value})}
                    onBlur={() => {
                        if (newVehicle.year && newVehicle.make && newVehicle.model && !newVehicle.photoUrl) {
                           setImageProcessing(true);
                           getCarImage(`${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`).then(url => {
                             if (url) setNewVehicle(prev => ({ ...prev, photoUrl: url }));
                             setImageProcessing(false);
                           }).catch(() => setImageProcessing(false));
                        }
                    }}
                  />
                </div>
              ))}
              <div className="space-y-1 relative col-span-2">
                <label className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>Vehicle Photo</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload vehicle photo"
                  className={`w-full h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all gap-2 relative overflow-hidden ${
                    newVehicle.photoUrl 
                      ? 'border-brand/40 bg-brand/5' 
                      : theme === 'dark' ? 'border-white/10 bg-black/5 hover:border-brand/40' : 'border-brand/10 bg-brand/5 hover:border-brand/20'
                  }`}
                >
                  {newVehicle.photoUrl && !imageProcessing ? (
                    <>
                      <img src={newVehicle.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setNewVehicle({...newVehicle, photoUrl: ''}); }}
                        title="Remove photo"
                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors z-20"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : imageProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                       <Loader2 className="w-8 h-8 animate-spin text-brand" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-brand">Optimizing Image...</span>
                    </div>
                  ) : (
                    <>
                      <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-white/5' : 'bg-brand/5'}`}>
                        <Camera className="w-5 h-5 text-brand" />
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>
                        Tap to upload vehicle photo
                      </span>
                    </>
                  )}
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                {!newVehicle.photoUrl && (
                  <div className="mt-2">
                    <p className={`text-[8px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-700' : 'text-brand/20'}`}>
                      Or provide a direct URL below
                    </p>
                    <input 
                      type="url" 
                      placeholder="https://images.unsplash.com/photo-..."
                      className={`w-full bg-black/5 rounded-xl px-4 py-2 mt-1 border outline-none transition-all text-[10px] ${
                        theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'
                      }`}
                      value={newVehicle.photoUrl || ''}
                      onChange={e => setNewVehicle({...newVehicle, photoUrl: e.target.value})}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowAddForm(false)}
                className={`flex-grow py-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                    theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-brand/5 text-brand/60 hover:bg-brand/10'
                }`}
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={saving}
                className="flex-grow py-4 bg-brand text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-brand/90 transition-all shadow-xl shadow-brand/20 active:scale-95"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Deploy to Garage"}
              </button>
            </div>
          </motion.form>
        ) : !selectedVehicle ? (
          <motion.div 
            key="list"
            className="grid sm:grid-cols-2 gap-6"
          >
            {vehicles.length === 0 && !loading ? (
              <div className="col-span-full py-20 text-center border border-dashed border-white/5 rounded-3xl opacity-50">
                <img src={logo} alt="CarDoc Logo" className="w-16 h-16 mx-auto mb-4 opacity-20 grayscale" />
                <p className="font-bold uppercase tracking-widest text-xs italic">Your garage is currently empty.</p>
              </div>
            ) : (
              vehicles.map((v) => (
                <motion.div 
                  key={v.id}
                  whileHover={{ scale: 1.01, y: -2 }}
                  onClick={() => setSelectedVehicle(v)}
                  className={`group p-4 rounded-2xl cursor-pointer border transition-all flex gap-4 items-center ${
                      theme === 'dark' ? 'bg-zinc-900/40 border-white/5 hover:border-brand/40' : 'bg-white border-brand/10 hover:border-brand shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className={`w-20 h-20 bg-black/5 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border transition-all ${
                      theme === 'dark' ? 'border-white/5 group-hover:border-brand/20' : 'border-brand/10 group-hover:border-brand/30'
                  }`}>
                    {v.photoUrl ? (
                      <motion.img 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        src={v.photoUrl} 
                        alt={v.model} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <img src={logo} alt="Brand" className={`w-8 h-8 object-contain transition-opacity opacity-20 group-hover:opacity-40`} />
                    )}
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="truncate">
                        <h3 className={`text-sm font-black uppercase tracking-tight truncate flex items-center gap-1.5 ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>
                          {v.make ? (
                            <>
                              <span className={`${theme === 'dark' ? 'text-brand/80' : 'text-brand/60'} text-[10px]`}>{v.year}</span>
                              {v.make}
                            </>
                          ) : (
                            <span>VIN: {v.vin}</span>
                          )}
                        </h3>
                        {v.model && <p className={`text-[10px] font-bold uppercase truncate ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>{v.model}</p>}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setVehicleToDelete(v.id); }}
                        title="Delete vehicle"
                        className={`p-1.5 transition-colors ${theme === 'dark' ? 'text-zinc-800 hover:text-red-500/80' : 'text-brand/20 hover:text-red-500/80'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-2">
                       <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${theme === 'dark' ? 'bg-black/30' : 'bg-brand/5'}`}>
                          <div className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                          <span className={`text-[9px] font-mono tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{v.mileage.toLocaleString()}</span>
                       </div>
                       {v.vin && (
                         <div className={`text-[9px] font-mono ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/30'}`}>
                           VIN: ...{v.vin.slice(-6)}
                         </div>
                       )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
             {selectedVehicle.photoUrl && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className={`relative w-full h-48 sm:h-64 rounded-[2rem] overflow-hidden border ${
                   theme === 'dark' ? 'border-white/10 shadow-2xl' : 'border-brand/10 shadow-lg'
                 }`}
               >
                 <img 
                   src={selectedVehicle.photoUrl} 
                   alt={selectedVehicle.model} 
                   className="w-full h-full object-cover" 
                   referrerPolicy="no-referrer"
                 />
                 <div className={`absolute inset-0 bg-gradient-to-t ${theme === 'dark' ? 'from-black/80' : 'from-brand/40'} via-transparent to-transparent`} />
                 <div className="absolute bottom-6 left-6">
                    <div className="px-3 py-1 bg-brand text-white text-[8px] font-black uppercase tracking-widest rounded-full shadow-lg inline-block mb-2">
                      Active Vehicle
                    </div>
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest italic leading-none">
                      Technical Hub
                    </p>
                 </div>
               </motion.div>
             )}

             <div className="grid sm:grid-cols-2 gap-4 pb-4 border-b border-brand/10">
                <button 
                  onClick={() => onDiagnose(selectedVehicle.make ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : (selectedVehicle.vin || 'Unknown Vehicle'))}
                  title="Run AI Diagnosis for this vehicle"
                  className={`flex items-center justify-center gap-2 py-3 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px] border ${
                      theme === 'dark' ? 'bg-zinc-900 border-white/5 hover:bg-brand text-white' : 'bg-white border-brand/10 hover:bg-brand hover:text-white shadow-sm'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" /> Start Diagnosis
                </button>
                <button 
                  onClick={() => onService(selectedVehicle.model || 'Vehicle', selectedVehicle.year || 'N/A', selectedVehicle.mileage.toString())}
                  title="View tailored maintenance roadmap"
                  className={`flex items-center justify-center gap-2 py-3 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px] border ${
                      theme === 'dark' ? 'bg-zinc-900 border-white/5 hover:bg-brand text-white' : 'bg-white border-brand/10 hover:bg-brand hover:text-white shadow-sm'
                  }`}
                >
                  <Timer className="w-3.5 h-3.5" /> Service Roadmap
                </button>
             </div>

             <div className="grid sm:grid-cols-3 gap-6">
                {[
                    { icon: Calendar, title: 'Standard Service', sub: `In ~2,500 Miles`, subColor: 'text-brand', label: 'Next Due' },
                    { icon: AlertCircle, title: 'System Normal', sub: 'Checked Today', subColor: 'text-green-500', label: 'Safety Health' },
                    { icon: History, title: `${records.length} Records`, sub: 'Lifetime', subColor: theme === 'dark' ? 'text-zinc-500' : 'text-brand/40', label: 'History' },
                ].map((stat, i) => (
                    <div key={i} className={`${theme === 'dark' ? 'bg-zinc-900/50 border-white/5' : 'bg-white border-brand/10 shadow-sm'} p-6 rounded-3xl border space-y-4`}>
                        <div className="flex items-center justify-between">
                            <stat.icon className={`w-5 h-5 ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/30'}`}>{stat.label}</span>
                        </div>
                        <div>
                            <h4 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{stat.title}</h4>
                            <p className={`text-xs font-bold uppercase italic mt-1 font-mono ${stat.subColor}`}>{stat.sub}</p>
                        </div>
                    </div>
                ))}
             </div>

             {/* Maintenance Forecast Timeline */}
             <div className="space-y-6 mt-8 pt-8 border-t border-brand/10">
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-black uppercase tracking-[0.2em] italic ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Maintenance Roadmap</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-500">Health Score:</span>
                    <span className="text-[10px] font-black text-green-500">88/100</span>
                  </div>
                </div>

                <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-brand/10">
                  {forecasts.map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="relative"
                    >
                      <div className={`absolute -left-[26px] top-1 w-4 h-4 rounded-full border-2 ${
                        item.urgency === 'high' ? 'bg-red-500 border-red-200' : 
                        item.urgency === 'medium' ? 'bg-orange-500 border-orange-200' : 'bg-green-500 border-green-200'
                      }`} />
                      <div className={`p-4 rounded-2xl border transition-all hover:scale-[1.02] cursor-pointer ${
                        theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-white border-brand/5 shadow-sm'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>
                            At {item.mileage.toLocaleString()} Miles
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-brand/5 text-brand/60'
                          }`}>
                            Est. {item.estimatedCost}
                          </span>
                        </div>
                        <h4 className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{item.task}</h4>
                      </div>
                    </motion.div>
                  ))}
                </div>
             </div>

             <div className="space-y-6 mt-8 pt-8 border-t border-brand/10">
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-black uppercase tracking-[0.2em] italic ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Maintenance Logs</h3>
                  <button 
                    onClick={() => setShowLogForm(true)}
                    title="Digitize new service record" 
                    className="text-[9px] font-black uppercase tracking-widest text-brand hover:text-brand-light"
                  >
                    Add Log +
                  </button>
                </div>

                <div className="space-y-4">
                  {loading && !selectedVehicle && (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-brand/20" />
                    </div>
                  )}
                  {showLogForm && (
                     <motion.form 
                       initial={{ opacity: 0, height: 0 }}
                       animate={{ opacity: 1, height: 'auto' }}
                       exit={{ opacity: 0, height: 0 }}
                       onSubmit={handleAddLog}
                       className={`p-6 rounded-3xl border space-y-4 ${theme === 'dark' ? 'bg-zinc-800/50 border-white/5' : 'bg-brand/5 border-brand/10'}`}
                     >
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Service Type</label>
                              <input 
                                required
                                placeholder="Oil Change"
                                className={`w-full px-3 py-2 rounded-xl border outline-none text-xs ${theme === 'dark' ? 'bg-black/20 border-white/10 text-white' : 'bg-white border-brand/10 text-brand'}`}
                                value={newLog.serviceName}
                                onChange={e => setNewLog({...newLog, serviceName: e.target.value})}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Mileage</label>
                              <input 
                                required
                                type="number"
                                placeholder="45000"
                                className={`w-full px-3 py-2 rounded-xl border outline-none text-xs ${theme === 'dark' ? 'bg-black/20 border-white/10 text-white' : 'bg-white border-brand/10 text-brand'}`}
                                value={newLog.mileage}
                                onChange={e => setNewLog({...newLog, mileage: e.target.value})}
                              />
                           </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Service Date</label>
                            <input 
                              required
                              type="date"
                              className={`w-full px-3 py-2 rounded-xl border outline-none text-xs ${theme === 'dark' ? 'bg-black/20 border-white/10 text-white' : 'bg-white border-brand/10 text-brand'}`}
                              value={newLog.date}
                              onChange={e => setNewLog({...newLog, date: e.target.value})}
                            />
                        </div>
                        <div className="flex gap-2">
                           <button 
                             type="button" 
                             onClick={() => setShowLogForm(false)}
                             className="flex-1 py-2 text-[8px] font-black uppercase tracking-widest text-zinc-500"
                           >
                             Cancel
                           </button>
                           <button 
                             type="submit"
                             disabled={loading}
                             className="flex-1 bg-brand text-white py-2 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg shadow-brand/20"
                           >
                             Save Entry
                           </button>
                        </div>
                     </motion.form>
                  )}

                  {records.length === 0 ? (
                    <div className={`py-20 text-center rounded-3xl border border-dashed ${theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-brand/[0.02] border-brand/10'}`}>
                      <History className={`w-10 h-10 mx-auto mb-4 ${theme === 'dark' ? 'text-zinc-800' : 'text-brand/10'}`} />
                      <p className={`text-xs font-bold uppercase tracking-widest italic ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/30'}`}>No records digitized for this vehicle.</p>
                    </div>
                  ) : (
                    records.map((log) => (
                      <div key={log.id} className={`p-6 rounded-3xl border flex items-center justify-between group transition-all ${
                          theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-white border-brand/10 shadow-sm hover:shadow-md'
                      }`}>
                        <div className="space-y-1">
                          <h4 className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{log.serviceName}</h4>
                          <p className={`text-xs font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>{log.mileage.toLocaleString()} Miles • {new Date(log.date.seconds * 1000).toLocaleDateString()}</p>
                        </div>
                        <ChevronRight className={`w-5 h-5 transition-colors ${theme === 'dark' ? 'text-zinc-700 group-hover:text-brand' : 'text-brand/20 group-hover:text-brand'}`} />
                      </div>
                    ))
                  )}
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
