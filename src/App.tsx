import logo from './logo.png';
import { useState, useEffect, lazy, Suspense } from 'react';
import { 
  Wrench, 
  Search, 
  MapPin, 
  Hammer, 
  Timer, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Youtube, 
  Car, 
  ShieldAlert,
  Loader2,
  Navigation,
  Video as VideoIcon,
  Play,
  Leaf,
  Fuel,
  Recycle,
  ExternalLink,
  ChevronDown,
  LayoutGrid,
  LogOut,
  User as UserIcon,
  ScanLine,
  Moon,
  Sun,
  ShieldCheck,
  Star,
  Scale,
  ArrowLeft,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getDiagnosis, 
  getDIYGuide, 
  getNearbyMechanics, 
  getMaintenanceTimeline,
  getKnownIssues,
  getNearbyRecyclingCenters,
  getCarImage,
  canonicalizeVehicle,
  DiagnosisResult, 
  DIYGuide, 
  Mechanic,
  MaintenanceStep,
  KnownIssue
} from './lib/gemini';
import { auth, signInWithGoogle, logout, IS_FIREBASE_REAL } from './lib/firebase';
import { useAuth } from './lib/hooks';
import { getVehicleByVin } from './lib/nhtsa';

const VideoRecorder = lazy(() => import('./components/VideoPlayer').then(m => ({ default: m.VideoRecorder })));
const CustomVideoPlayer = lazy(() => import('./components/VideoPlayer').then(m => ({ default: m.CustomVideoPlayer })));
const Garage = lazy(() => import('./components/Garage').then(m => ({ default: m.Garage })));
const Markdown = lazy(() => import('react-markdown'));

import { playSound } from './lib/sounds';

// --- Helper Components ---

const stripBold = (text: string) => (text || '').replace(/\*\*/g, '');

const LoadingMessage = () => {
  const [index, setIndex] = useState(0);
  const messages = [
    "Analyzing Symptoms",
    "Consulting Neural Network",
    "Refining Mechanical Logic",
    "Fetching Technical Manuals",
    "Validating Components",
    "Auditing NHTSA Data",
    "Finalizing Performance Model"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return <motion.span key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{messages[index]}</motion.span>;
};

const SeverityBadge = ({ severity, theme }: { severity: string, theme: 'dark' | 'light' }) => {
  const configs = {
    low: { color: 'bg-green-500/10 text-green-500 border-green-500/20', text: 'Low Tech Urgency', icon: ShieldCheck },
    medium: { color: 'bg-brand/10 text-brand border-brand/20', text: 'System Caution', icon: AlertTriangle },
    high: { color: 'bg-orange-600/10 text-orange-500 border-orange-500/20', text: 'Warning Status', icon: AlertTriangle },
    critical: { color: 'bg-red-600 text-white border-red-600', text: 'Critical Component Failure', icon: ShieldAlert }
  };
  const config = configs[severity as keyof typeof configs] || configs.medium;
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.color} text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 cursor-default`}>
      <config.icon className="w-3 h-3" />
      {config.text}
    </div>
  );
};

const VehicleHero = ({ image, details, theme, isVerified }: { image: string | null, details: string, theme: 'dark' | 'light', isVerified?: boolean }) => {
  if (!image) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={`relative w-full h-64 sm:h-80 rounded-[2.5rem] overflow-hidden mb-12 border ${theme === 'dark' ? 'border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,1)]' : 'border-brand/10 shadow-2xl shadow-brand/10'} group`}
    >
      <img 
        src={image} 
        alt={details} 
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[4000ms] ease-out filter brightness-[0.8] group-hover:brightness-95" 
        referrerPolicy="no-referrer"
      />
      
      {/* Dynamic Scan Line Effect */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ 
            top: ['-100%', '200%'],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute left-0 right-0 h-20 bg-gradient-to-b from-transparent via-brand/20 to-transparent opacity-40 blur-xl"
        />
      </div>

      <div className={`absolute inset-0 bg-gradient-to-t ${theme === 'dark' ? 'from-black via-black/20 to-transparent' : 'from-brand/40 via-transparent to-transparent'} opacity-90`} />
      
      <div className="absolute bottom-10 left-10 right-10 z-20 flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2 max-w-[70%] sm:max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand rounded-full text-[9px] font-black text-white uppercase tracking-[0.3em] italic mb-2">
            <ScanLine className="w-3 h-3" /> {isVerified ? 'AI Enhanced Spec' : 'Digital Scan Validated'}
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white uppercase italic tracking-tighter drop-shadow-2xl truncate">{details}</h2>
        </div>
      </div>

      {/* HUD Elements */}
      <div className="absolute top-6 left-6 flex flex-col gap-1 opacity-20 group-hover:opacity-40 transition-opacity">
        <div className="w-12 h-[1px] bg-white" />
        <div className="w-8 h-[1px] bg-white" />
      </div>
    </motion.div>
  );
};

const PartSourcesDropdown = ({ sources, theme }: { sources: { retailer: string; price: string; url: string }[], theme: 'dark' | 'light' }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-all border ${
          theme === 'dark' 
            ? 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800' 
            : 'bg-brand/5 border-brand/10 text-brand/60 hover:bg-brand/10 shadow-sm'
        }`}
      >
        <span>Compare {sources.length} Prices</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`overflow-hidden mt-1 rounded-lg shadow-xl border ${
              theme === 'dark' ? 'bg-zinc-900/90 border-white/5' : 'bg-white border-brand/10'
            }`}
          >
            {sources.map((source, i) => (
              <a 
                key={i}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between p-3 border-b last:border-0 group transition-colors ${
                   theme === 'dark' ? 'hover:bg-brand/10 border-white/5' : 'hover:bg-brand/5 border-brand/5'
                }`}
              >
                <div className="flex flex-col">
                  <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-zinc-300' : 'text-brand'}`}>{source.retailer}</span>
                  {i === 0 && <span className="text-[8px] text-green-500 font-black uppercase">Cheapest</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${theme === 'dark' ? 'text-zinc-100' : 'text-brand'}`}>{source.price}</span>
                  <ExternalLink className={`w-2.5 h-2.5 ${theme === 'dark' ? 'text-zinc-500 group-hover:text-brand' : 'text-brand/30 group-hover:text-brand'}`} />
                </div>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isInitialBoot, setIsInitialBoot] = useState(true);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitialBoot(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const [symptoms, setSymptoms] = useState('');
  const [carDetails, setCarDetails] = useState('');
  const [zipCode, setZipCode] = useState(() => localStorage.getItem('cardoc_zip') || '');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState<DiagnosisResult[]>([]);
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<DiagnosisResult | null>(null);
  const [diyGuide, setDiyGuide] = useState<DIYGuide | null>(null);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [recyclingCenters, setRecyclingCenters] = useState<{ name: string; address: string; acceptedItems: string[] }[]>([]);
  const [view, setView] = useState<'options' | 'diy' | 'mechanics' | 'recalls' | 'maintenance' | 'garage'>('options');
  const { user } = useAuth();
  const [recallSearch, setRecallSearch] = useState({ make: '', model: '', year: '', displayModel: '' });
  const [recalls, setRecalls] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<MaintenanceStep[]>([]);
  const [knownIssues, setKnownIssues] = useState<KnownIssue[]>([]);
  const [maintenanceSearch, setMaintenanceSearch] = useState({ car: '', year: '', mileage: '' });
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [carImage, setCarImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [isVehicleVerified, setIsVehicleVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workshopActive, setWorkshopActive] = useState(false);
  const [currentWorkshopStep, setCurrentWorkshopStep] = useState(0);
  const [workshopProgress, setWorkshopProgress] = useState<boolean[]>([]);
  const [workshopTimer, setWorkshopTimer] = useState<number | null>(null);
  const [greaseMode, setGreaseMode] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [muted, setMuted] = useState(() => localStorage.getItem('cardoc_muted') === 'true');

  // Handle startup sound on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      playSound('startup');
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  const toggleMuted = () => {
    const newVal = !muted;
    setMuted(newVal);
    localStorage.setItem('cardoc_muted', String(newVal));
  };

  // Load voices once
  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  // Grease Mode TTS logic
  useEffect(() => {
    if (greaseMode && workshopActive && diyGuide) {
      // Find a high-quality human-sounding voice from availableVoices state
      const preferredVoice = availableVoices.find(v => 
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium')) && v.lang.startsWith('en-')
      ) || availableVoices.find(v => v.lang.startsWith('en-'));

      const stepText = stripBold(diyGuide.steps[currentWorkshopStep]);
      
      const intros = [
        "Alright, listen up.",
        "Next move is important.",
        "Got it. Now,",
        "Precision time.",
        "Keep it steady.",
        "Focus on this part.",
        "Doing great, neighbor."
      ];
      const randomIntro = currentWorkshopStep === 0 ? "Let's get this fixed." : intros[currentWorkshopStep % intros.length];
      
      const fullText = `${randomIntro} Step ${currentWorkshopStep + 1}. ${stepText}`;
      const utterance = new SpeechSynthesisUtterance(fullText);
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.rate = 1.0; 
      utterance.pitch = 1.0; 
      utterance.volume = 1.0;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentWorkshopStep, greaseMode, workshopActive, diyGuide, availableVoices]);

  const fetchCarImage = async (query: string) => {
    if (!query) return;
    const cacheKey = `v_img_${query.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setCarImage(cached);
      return;
    }
    setImageLoading(true);
    try {
      getCarImage(query).then(img => {
        if (img) {
          setCarImage(img);
          localStorage.setItem(cacheKey, img);
        }
        setImageLoading(false);
      });
    } catch (err) {
      setImageLoading(false);
      console.warn("Visual fetch deferred:", err);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, view]);

  const handleCheckRecalls = async (override?: { make: string, model: string, year: string }) => {
    const make = override?.make || recallSearch.make;
    const model = override?.model || recallSearch.model;
    const year = override?.year || recallSearch.year;

    if (!make || !model || !year) return;
    setLoading(true);
    try {
      fetchCarImage(`${year} ${make} ${model}`);

      const resp = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`);
      const data = await resp.json();
      setRecalls(data.results || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDiagnose = async () => {
    if (!symptoms || !carDetails) return;
    setLoading(true);
    setError(null);
    setCarImage(null); // Clear old image for new search

    // Kick off image fetch early based on raw input for faster initial visual
    fetchCarImage(carDetails);

    try {
      // Step 1: AI-powered vehicle canonicalization
      const formalDetails = await canonicalizeVehicle(carDetails);
      if (formalDetails && formalDetails !== carDetails) {
        setCarDetails(formalDetails);
        setIsVehicleVerified(true);
        // Re-fetch more accurate image if needed
        fetchCarImage(formalDetails);
      }

      let videoBase64: string | undefined;
      if (recordedVideo) {
        const reader = new FileReader();
        videoBase64 = await new Promise((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(recordedVideo);
        });
      }

      const diagnosis = await getDiagnosis(symptoms, formalDetails || carDetails, videoBase64, zipCode);
      
      if (zipCode) {
        localStorage.setItem('cardoc_zip', zipCode);
      }
      
      setResults(diagnosis);
      setResultsLoaded(true);
      playSound('success');
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to analyze vehicle symptoms. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIssue = (issue: DiagnosisResult) => {
    setSelectedIssue(issue);
    setView('options');
    setStep(3);
  };

  const handleGetDIY = async () => {
    if (!selectedIssue) return;
    setLoading(true);
    try {
      const searchLocation = zipCode || location || 'New York';
      const [guide, centers] = await Promise.all([
        getDIYGuide(selectedIssue.title, carDetails, searchLocation),
        getNearbyRecyclingCenters(searchLocation)
      ]);
      setDiyGuide(guide);
      setRecyclingCenters(centers);
      setView('diy');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGetMechanics = async () => {
    const searchLocation = zipCode || location || 'New York'; // Fallback
    if (!selectedIssue) return;
    setLoading(true);
    try {
      const list = await getNearbyMechanics(searchLocation, selectedIssue.title);
      setMechanics(list);
      setView('mechanics');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGetTimeline = async (overrideCar?: string, overrideYear?: string, overrideMileage?: string) => {
    const car = overrideCar || maintenanceSearch.car;
    const year = overrideYear || maintenanceSearch.year;
    const mileage = overrideMileage || maintenanceSearch.mileage;
    
    if (!car || !year || !mileage) {
       setStep(5);
       return;
    }
    setLoading(true);
    setError(null);
    try {
      const cleanMileage = mileage.replace(/[^0-9]/g, '');
      const mileageNum = parseInt(cleanMileage) || 0;

      // Async image fetch - non-blocking
      fetchCarImage(`${year} ${car}`);

      const [data, issues] = await Promise.all([
        getMaintenanceTimeline(car, year, mileageNum),
        getKnownIssues(car, year)
      ]);
      setTimeline(data);
      setKnownIssues(issues);
      setStep(5);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to generate maintenance roadmap.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setResults([]);
    setSelectedIssue(null);
    setDiyGuide(null);
    setMechanics([]);
    setRecalls([]);
    setTimeline([]);
    setKnownIssues([]);
    setCarImage(null);
    setIsVehicleVerified(false);
    setView('options');
  };

  // Global Loading Overlay
  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0a0a0a] text-zinc-100' : 'bg-[#f8f9fa] text-[#00357A]'} font-sans selection:bg-brand/30`}>
      <header className={`border-b border-brand/10 ${theme === 'dark' ? 'bg-black/60 shadow-[0_4px_30px_rgba(0,0,0,0.5)]' : 'bg-white/80 shadow-[0_4px_30px_rgba(0,53,122,0.1)]'} backdrop-blur-xl sticky top-0 z-50 transition-colors duration-300`}>
        <div className="max-w-6xl mx-auto px-4 h-24 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-6 group">
              <div className="transition-all">
                <img src={logo} alt="CarDoc Logo" className="w-28 h-28 object-contain" />
              </div>
              <div className="hidden sm:block">
                <h1 className={`text-4xl font-black tracking-tighter uppercase italic leading-none transition-colors ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>CarDoc</h1>
                <div className="flex items-center gap-1.5 mt-2">
                   <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                   <p className={`text-[10px] font-black uppercase tracking-[0.5em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Your Pocket Mechanic</p>
                </div>
              </div>
              {!IS_FIREBASE_REAL && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full ml-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-500/80">Local Demo Mode</span>
                </div>
              )}
            </div>
          </div>
          
          <nav className="flex items-center gap-3 sm:gap-6">
            <div className={`flex items-center ${theme === 'dark' ? 'bg-zinc-900/50' : 'bg-brand/5'} p-1 rounded-2xl border border-brand/10`}>
              {[
                { id: 'options', label: 'Troubleshoot', icon: ShieldAlert },
                { id: 'recalls', label: 'Recalls', icon: ScanLine },
                { id: 'maintenance', label: 'Schedule', icon: Timer },
                { id: 'garage', label: 'Garage', icon: LayoutGrid }
              ].map((item) => (
                <button 
                  key={item.id}
                  title={item.label}
                  onClick={() => {
                    if (item.id === 'options') {
                      setView('options');
                      if (step >= 4) setStep(results.length > 0 ? (selectedIssue ? 3 : 2) : 1);
                    } else if (item.id === 'recalls') {
                      setView('recalls'); setStep(4);
                    } else if (item.id === 'maintenance') {
                      setView('maintenance'); setStep(5); handleGetTimeline();
                    } else {
                      setView('garage');
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all relative ${
                    (view === item.id || (item.id === 'options' && view === 'options' && step < 4)) 
                      ? 'text-white bg-brand shadow-lg shadow-brand/20' 
                      : `${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-brand/60 hover:text-brand'}`
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="h-6 w-[1px] bg-brand/10 mx-1" />

            <button 
              onClick={() => {
                toggleMuted();
                if (muted) playSound('success'); // Play a quick success sound when unmuting to confirm
              }}
              className={`p-2.5 rounded-xl border transition-all ${
                theme === 'dark' 
                  ? 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:border-white/10' 
                  : 'bg-white border-brand/10 text-brand/60 hover:text-brand hover:border-brand/20 shadow-sm'
              }`}
              title={muted ? "Unmute All Sounds" : "Mute All Sounds"}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-2.5 rounded-xl border transition-all ${
                theme === 'dark' 
                  ? 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:border-white/10' 
                  : 'bg-white border-brand/10 text-brand/60 hover:text-brand hover:border-brand/20 shadow-sm'
              }`}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => logout()}
                  className={`p-2.5 border rounded-xl transition-all group ${
                    theme === 'dark' 
                      ? 'bg-zinc-900 border-white/5 hover:border-red-500/30' 
                      : 'bg-white border-brand/10 hover:border-red-500/30 shadow-sm'
                  }`}
                  title="Logout"
                >
                  <LogOut className={`w-4 h-4 transition-colors ${theme === 'dark' ? 'text-zinc-500 group-hover:text-red-500' : 'text-brand/60 group-hover:text-red-500'}`} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signInWithGoogle()}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl hover:bg-brand/90 transition-all font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/30 active:scale-95"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Join</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Bar */}
        {step <= 3 && view !== 'garage' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 flex items-center justify-between gap-2 max-w-md mx-auto"
          >
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-grow flex items-center gap-2">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                    step >= s ? 'bg-brand text-white shadow-lg shadow-brand/30' : `${theme === 'dark' ? 'bg-zinc-900 text-zinc-500 border-white/5' : 'bg-white text-zinc-300 border-brand/10 shadow-sm'}`
                  } border`}
                >
                  {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div className={`h-[2px] flex-grow rounded-full transition-all ${step > s ? 'bg-brand' : `${theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-brand/5 border-brand/5'}`} border-none`} />
                )}
              </div>
            ))}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {view === 'garage' && (
            <motion.div
              key="garage-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>}>
                <Garage 
                  theme={theme}
                  onService={(car, year, mileage) => {
                    setMaintenanceSearch({ car, year, mileage });
                    setView('maintenance');
                    setStep(5);
                    handleGetTimeline(car, year, mileage);
                  }}
                  onDiagnose={(details) => {
                    setCarDetails(details);
                    setView('options');
                    setStep(1);
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                  }}
                />
              </Suspense>
            </motion.div>
          )}
          {view !== 'garage' && step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className={`text-4xl sm:text-7xl font-black tracking-tighter uppercase italic leading-[0.9] text-glow ${theme === 'dark' ? 'text-white' : 'text-brand'}`}> Vehicle System <br/> Diagnosis.</h2>
                <p className={`${theme === 'dark' ? 'text-zinc-400' : 'text-brand/70'} text-lg max-w-xl mx-auto font-medium uppercase tracking-widest text-[10px]`}>Provide auditory, visual, or structural indicators of vehicle malfunction.</p>
              </div>

              <div className={`${theme === 'dark' ? 'bg-zinc-900/50 border-white/5 shadow-2xl' : 'bg-white border-brand/10 shadow-xl shadow-brand/5'} grid gap-6 p-8 rounded-2xl border backdrop-blur-sm relative overflow-hidden group`}>
                <div className={`absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 ${theme === 'dark' ? 'bg-brand/10' : 'bg-brand/5'} blur-[80px] rounded-full group-hover:bg-brand/20 transition-all`} />
                
                <div className="grid sm:grid-cols-3 gap-6 relative">
                  <div className="sm:col-span-2 space-y-2">
                    <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Vehicle Details</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 2018 Toyota Camry 2.5L"
                      className={`w-full bg-black/5 rounded-xl px-4 py-4 border ${theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'} outline-none transition-colors font-medium`}
                      value={carDetails}
                      onChange={(e) => setCarDetails(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Zip Code</label>
                    <input 
                      type="text" 
                      maxLength={5}
                      placeholder="Your Area"
                      className={`w-full bg-black/5 rounded-xl px-4 py-4 border ${theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'} outline-none transition-colors font-medium text-center tracking-widest`}
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Describe Symptoms</label>
                  <textarea 
                    placeholder="e.g. Squeaking noise when braking, vibrating steering wheel at highway speeds..."
                    rows={4}
                    className={`w-full bg-black/5 rounded-xl px-4 py-4 border ${theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'} outline-none transition-colors resize-none font-medium`}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                  />
                </div>

                  <div className={`space-y-4 pt-4 border-t ${theme === 'dark' ? 'border-white/5' : 'border-brand/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Add Video Evidence (Optional)</label>
                      <span className={`text-[9px] font-bold uppercase tracking-widest italic ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>Beta Feature</span>
                    </div>
                    <Suspense fallback={<div className="h-20 bg-black/5 rounded-xl animate-pulse" />}>
                      <VideoRecorder onRecordingComplete={(blob) => setRecordedVideo(blob)} />
                    </Suspense>
                  </div>
                <button 
                  onClick={handleDiagnose}
                  disabled={loading || !symptoms || !carDetails}
                  className="w-full bg-brand hover:bg-brand/90 disabled:opacity-50 text-white font-black uppercase tracking-widest py-5 rounded-xl shadow-xl shadow-brand/30 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  {loading ? 'Processing Technical Input...' : 'Initiate System Analysis'}
                </button>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-500 text-xs font-bold uppercase tracking-widest text-center"
                >
                  {error.includes('RESOURCE_EXHAUSTED') ? 'Daily AI limit reached. Please try again later.' : error}
                </motion.div>
              )}

              <div className="flex flex-wrap justify-center gap-6">
                {[
                  { icon: ShieldAlert, label: 'AI Diagnosis' },
                  { icon: Navigation, label: 'Nearby Mechanics' },
                  { icon: Wrench, label: 'DIY Guides' }
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border ${theme === 'dark' ? 'bg-zinc-900/50 text-zinc-500 border-white/5' : 'bg-white text-brand/60 border-brand/10 shadow-sm'}`}>
                    <item.icon className="w-3.5 h-3.5 text-brand" /> {item.label}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view !== 'garage' && step === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
              <VehicleHero image={carImage} details={`${recallSearch.year} ${recallSearch.make} ${recallSearch.displayModel || recallSearch.model}`} theme={theme} />
              <div className="text-center space-y-2">
                <h2 className={`text-4xl font-black uppercase tracking-tighter italic text-glow ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Safety Recall Audit.</h2>
                <p className={`text-[10px] font-black uppercase tracking-widest italic ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Verify manufacturer safety bulletins and precision VIN lookup.</p>
              </div>

              <div className={`p-8 rounded-[2rem] border transition-all ${theme === 'dark' ? 'bg-zinc-900/40 border-white/5' : 'bg-white border-brand/10 shadow-xl shadow-brand/5'} space-y-6 relative overflow-hidden`}>
                <div className={`absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 blur-[60px] rounded-full transition-all ${theme === 'dark' ? 'bg-brand/10' : 'bg-brand/5'}`} />
                <div className="space-y-4 relative">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ScanLine className="w-3.5 h-3.5 text-brand" />
                      <label className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Precision VIN Lookup</label>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="17-character VIN"
                        className={`flex-grow bg-black/5 rounded-xl px-4 py-4 border outline-none font-mono text-sm uppercase transition-all ${
                            theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'
                        }`}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const vin = (e.target as HTMLInputElement).value;
                            if (vin.length >= 11) {
                              setLoading(true);
                              try {
                                const data = await getVehicleByVin(vin);
                                if (data.year) {
                                  // Create a more precise model description including series and trim
                                  const fullModel = [data.model, data.series, data.trim].filter(Boolean).join(' ');
                                  const searchData = { year: data.year, make: data.make, model: data.model, displayModel: fullModel };
                                  setRecallSearch(searchData);
                                  handleCheckRecalls(searchData);
                                }
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setLoading(false);
                              }
                            }
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Year', placeholder: '2020', value: recallSearch.year, key: 'year' },
                      { label: 'Make', placeholder: 'Toyota', value: recallSearch.make, key: 'make' },
                      { label: 'Model', placeholder: 'Camry', value: recallSearch.model, key: 'model' },
                    ].map((field) => (
                      <div key={field.key} className="space-y-2">
                        <label className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>{field.label}</label>
                        <input 
                          type="text" 
                          placeholder={field.placeholder}
                          className={`w-full bg-black/5 rounded-xl px-4 py-3 border outline-none transition-all ${
                              theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'
                          }`}
                          value={field.value}
                          onChange={(e) => setRecallSearch({ ...recallSearch, [field.key]: (e.target as HTMLInputElement).value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => handleCheckRecalls()}
                  className="w-full bg-brand hover:bg-brand/90 text-white py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-brand/30 active:scale-95"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                  {loading ? 'Retrieving Records...' : 'Verify Safety Data'}
                </button>
              </div>

              <div className="space-y-6">
                {recalls.length > 0 ? (
                  recalls.map((recall, i) => (
                    <div key={i} className={`p-8 rounded-[2rem] border-l-4 border-l-red-600 transition-all border ${theme === 'dark' ? 'bg-zinc-900 border-red-500/10 shadow-2xl' : 'bg-white border-brand/10 shadow-lg'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-4 py-1.5 rounded-full uppercase tracking-widest">Safety Advisory</span>
                        <span className={`text-[10px] font-mono font-bold ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/30'}`}>{recall.ModelYear}</span>
                      </div>
                      <h3 className={`font-black text-2xl mb-4 uppercase italic tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{recall.Component}</h3>
                      <p className={`text-sm leading-relaxed mb-6 font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-brand/70'}`}>{recall.Summary}</p>
                      <div className={`p-6 rounded-2xl ${theme === 'dark' ? 'bg-black/40 border border-white/5' : 'bg-brand/[0.03] border border-brand/5'}`}>
                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] block mb-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>NHTSA Safety Consequence</span>
                        <p className={`text-sm font-semibold italic ${theme === 'dark' ? 'text-zinc-300' : 'text-brand'}`}>"{recall.Conequence || recall.Consequence || 'No specific consequence reported.'}"</p>
                      </div>
                      {recall.Remedy && (
                        <div className={`mt-4 p-6 rounded-2xl ${theme === 'dark' ? 'bg-green-500/5 border border-green-500/10' : 'bg-green-50/[0.3] border border-green-500/10'}`}>
                           <span className={`text-[10px] font-black uppercase tracking-[0.3em] block mb-2 text-green-500`}>Official Remedy</span>
                           <p className={`text-sm font-semibold italic ${theme === 'dark' ? 'text-zinc-300' : 'text-brand'}`}>{recall.Remedy}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : recalls.length === 0 && !loading && recallSearch.make && (
                  <div className="text-center py-20 bg-brand/[0.02] rounded-[3rem] border-2 border-dashed border-brand/10">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-6 opacity-20" />
                    <p className={`font-black uppercase tracking-[0.3em] text-sm ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Zero Active Advisories</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view !== 'garage' && step === 5 && (
            <motion.div 
              key="step5"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
              <VehicleHero image={carImage} details={`${maintenanceSearch.year} ${maintenanceSearch.car}`} theme={theme} />
              <div className="text-center space-y-2">
                <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter italic text-glow leading-none">Maintenance Schedule</h2>
                <p className="text-zinc-500 text-[10px] uppercase font-black tracking-widest italic text-pretty">Calculated service requirements based on vehicle telemetry.</p>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-500 text-xs font-bold uppercase tracking-widest text-center"
                >
                  {error.includes('RESOURCE_EXHAUSTED') ? 'Daily AI limit reached. Please try again later.' : error}
                </motion.div>
              )}

              {/* Maintenance Search Form */}
              <div className={`${theme === 'dark' ? 'bg-zinc-900/50 border-white/5 shadow-2xl' : 'bg-white border-brand/10 shadow-xl shadow-brand/5'} p-6 rounded-2xl border backdrop-blur-sm grid sm:grid-cols-4 gap-4 items-end relative overflow-hidden group transition-all`}>
                <div className={`absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 blur-[80px] rounded-full transition-all text-glow ${theme === 'dark' ? 'bg-brand/10' : 'bg-brand/5'}`} />
                
                <div className="space-y-2 sm:col-span-1 relative z-10">
                  <label className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Car Model</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Honda Civic"
                    className={`w-full bg-black/5 rounded-xl px-4 py-2.5 text-sm outline-none transition-all font-medium ${theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'}`}
                    value={maintenanceSearch.car}
                    onChange={(e) => setMaintenanceSearch({...maintenanceSearch, car: e.target.value})}
                  />
                </div>
                <div className="space-y-2 relative z-10">
                  <label className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Year</label>
                  <input 
                    type="text" 
                    placeholder="2022"
                    className={`w-full bg-black/5 rounded-xl px-4 py-2.5 text-sm outline-none transition-all font-medium ${theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'}`}
                    value={maintenanceSearch.year}
                    onChange={(e) => setMaintenanceSearch({...maintenanceSearch, year: e.target.value})}
                  />
                </div>
                <div className="space-y-2 relative z-10">
                  <label className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Mileage</label>
                  <input 
                    type="text" 
                    placeholder="45000"
                    className={`w-full bg-black/5 rounded-xl px-4 py-2.5 text-sm outline-none transition-all font-medium ${theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'}`}
                    value={maintenanceSearch.mileage}
                    onChange={(e) => setMaintenanceSearch({...maintenanceSearch, mileage: e.target.value})}
                  />
                </div>
                <button 
                  onClick={() => handleGetTimeline()}
                  disabled={loading}
                  className="w-full bg-brand h-[42px] rounded-xl font-black text-[10px] uppercase tracking-widest text-white hover:bg-brand/90 transition-all shadow-lg shadow-brand/20 active:scale-95 flex items-center justify-center gap-2 relative z-10"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Timer className="w-4 h-4" />}
                  {loading ? 'Retrieving Specifications...' : 'Generate Schedule'}
                </button>
              </div>

              {knownIssues.length > 0 && (
                <div className="space-y-6 pt-10 border-t border-brand/10">
                  <div className="flex items-center gap-4">
                    <h3 className={`text-sm font-black uppercase tracking-widest italic ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Common Issues for your Car</h3>
                    <div className={`h-[1px] flex-grow ${theme === 'dark' ? 'bg-white/5' : 'bg-brand/10'}`} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {knownIssues.map((issue, i) => (
                      <div key={i} className={`p-6 rounded-2xl relative overflow-hidden group border transition-all ${
                        theme === 'dark' ? 'bg-zinc-900/40 border-red-500/10 hover:border-red-500/30 shadow-2xl' : 'bg-white border-brand/10 hover:border-brand shadow-sm shadow-brand/5'
                      }`}>
                        <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${theme === 'dark' ? 'text-red-500' : 'text-red-600'}`}>
                           <ShieldAlert className="w-12 h-12" />
                        </div>
                        <h4 className={`font-black text-sm uppercase tracking-tight mb-2 ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{issue.title}</h4>
                        <p className={`text-xs leading-relaxed mb-4 font-medium ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>{stripBold(issue.description)}</p>
                        
                        <div className="space-y-3">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-red-500/80 block mb-1">Symptoms</span>
                            <div className="flex flex-wrap gap-2">
                              {issue.symptoms.map((s, j) => (
                                <span key={j} className={`text-[9px] border px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                    theme === 'dark' ? 'bg-red-500/5 border-red-500/10 text-zinc-400' : 'bg-brand/5 border-brand/10 text-brand/60'
                                }`}>{stripBold(s)}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-green-500/80 block mb-1">Remedy</span>
                            <p className={`text-[10px] font-semibold italic ${theme === 'dark' ? 'text-zinc-400' : 'text-brand/60'}`}>"{stripBold(issue.remedy)}"</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {timeline.length > 0 ? (
                <div className="relative border-l border-white/10 ml-4 space-y-12 pb-12 mt-12">
                  {timeline.map((item, i) => (
                    <div key={i} className="relative pl-12 group">
                      <div className={`absolute left-[-5px] top-0 w-[10px] h-[10px] rounded-full bg-brand shadow-[0_0_15px_var(--color-brand)] group-hover:scale-150 transition-transform`} />
                      <div className={`absolute left-10 top-0 text-[10px] font-black text-white uppercase tracking-widest bg-brand px-2 py-1 rounded border border-brand/20 translate-y-[-100%] mb-2 shadow-lg shadow-brand/20`}>
                         {item.mileage.toLocaleString()} Miles
                      </div>
                      
                      <div className={`p-6 rounded-3xl group-hover:border-brand/30 transition-all backdrop-blur-sm relative overflow-hidden border ${
                        theme === 'dark' ? 'bg-zinc-900/40 border-white/5' : 'bg-white border-brand/10 shadow-sm'
                      }`}>
                        <div className={`absolute top-0 right-0 w-32 h-32 blur-[40px] -mr-16 -mt-16 group-hover:opacity-20 transition-all ${theme === 'dark' ? 'bg-brand' : 'bg-brand/20'}`} />
                        <div className="flex justify-between items-start mb-4 relative z-10">
                          <SeverityBadge severity={item.importance.toLowerCase()} theme={theme} />
                        </div>
                        <ul className="space-y-3 relative z-10">
                          {item.tasks.map((task, j) => (
                            <li key={j} className={`flex font-medium items-center gap-3 text-sm ${theme === 'dark' ? 'text-zinc-300' : 'text-brand/80'}`}>
                               <div className="w-1.5 h-1.5 bg-brand rounded-full" /> {stripBold(task)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !loading && (
                <div className="text-center py-20 bg-zinc-900/10 rounded-3xl border border-dashed border-white/5">
                   <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] italic">No roadmap generated yet. Search your vehicle above.</p>
                </div>
              )}
            </motion.div>
          )}

          {view !== 'garage' && step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
              <VehicleHero image={carImage} details={carDetails} theme={theme} isVerified={isVehicleVerified} />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-2xl font-black italic uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Diagnostic Results.</h2>
                  <p className={`text-[10px] uppercase font-black tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>{carDetails}</p>
                </div>
                <button onClick={reset} className={`text-[10px] font-black uppercase tracking-widest border px-4 py-2 rounded-xl transition-all ${
                  theme === 'dark' ? 'text-zinc-500 hover:text-white border-white/10' : 'text-brand/60 hover:text-brand border-brand/10 shadow-sm'
                }`}>New Scan</button>
              </div>

              <div className="grid gap-6">
                {results.length > 0 ? results.map((result, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.1, duration: 0.5 } }}
                    whileHover={{ scale: 1.01, x: 8 }}
                    onClick={() => handleSelectIssue(result)}
                    className={`p-6 rounded-[2.5rem] border cursor-pointer transition-all group flex items-center justify-between relative overflow-hidden ${
                      theme === 'dark' ? 'bg-zinc-900/40 border-white/5 hover:border-brand/40 shadow-2xl' : 'bg-white border-brand/10 hover:border-brand shadow-lg shadow-brand/5'
                    }`}
                  >
                    <div className={`absolute top-0 left-0 w-1 h-full ${
                       result.severity === 'critical' ? 'bg-red-600' :
                       result.severity === 'high' ? 'bg-orange-500' :
                       result.severity === 'medium' ? 'bg-brand' : 'bg-green-500'
                    }`} />
                    
                    <div className="flex items-center gap-8 min-w-0 flex-1 relative z-10">
                      <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border transition-all flex-shrink-0 ${
                        theme === 'dark' ? 'bg-black/60 border-white/10 group-hover:border-brand/40 shadow-inner' : 'bg-brand/5 border-brand/5 group-hover:border-brand/20 shadow-sm'
                      }`}>
                        <AlertTriangle className={`w-8 h-8 ${
                          result.severity === 'critical' ? 'text-red-500' :
                          result.severity === 'high' ? 'text-orange-500' : 'text-brand'
                        }`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-4 mb-3">
                           <h3 className={`font-black text-xl uppercase tracking-tighter italic truncate ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{result.title}</h3>
                           <div className="flex flex-wrap items-center gap-3">
                            <SeverityBadge severity={result.severity} theme={theme} />
                            
                            {/* Confidence Indicator */}
                            <div className="flex flex-col gap-1 w-32 shrink-0">
                              <div className="flex items-center justify-between text-[8px] font-black uppercase text-zinc-500 tracking-widest font-mono">
                                <span>Confidence</span>
                                <span>{Math.round(result.probability)}%</span>
                              </div>
                              <div className={`h-1 w-full rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/5' : 'bg-brand/10'}`}>
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${result.probability}%` }}
                                  transition={{ duration: 1.5, ease: "circOut" }}
                                  className="h-full bg-brand shadow-[0_0_8px_var(--color-brand)]"
                                />
                              </div>
                            </div>

                            {/* Tutorial Link if available */}
                            {result.video && (
                              <div className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-2 ${
                                theme === 'dark' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600'
                              }`}>
                                <Youtube className="w-3.5 h-3.5" />
                                {result.video.title}
                              </div>
                            )}

                            {result.marketValueImpact && (
                               <div className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-500/20 bg-blue-500/10 text-blue-400 flex items-center gap-2">
                                 <LayoutGrid className="w-3 h-3" />
                                 Market Impact: {result.marketValueImpact}
                               </div>
                             )}
                           </div>
                        </div>
                        <p className={`text-xs font-bold leading-relaxed ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/50'}`}>{result.description}</p>
                      </div>
                    </div>

                    <div className={`p-4 rounded-2xl transition-all flex-shrink-0 ml-4 ${theme === 'dark' ? 'bg-white/5 text-zinc-700 group-hover:text-brand group-hover:bg-brand/20 shadow-inner' : 'bg-brand/5 text-brand/20 group-hover:text-brand group-hover:bg-brand/10 shadow-sm'}`}>
                      <ChevronRight className="w-6 h-6 transition-transform translate-x-0 group-hover:translate-x-1" />
                    </div>
                  </motion.div>
                )) : (
                  <div className="text-center py-20 bg-brand/[0.02] rounded-[3rem] border-2 border-dashed border-brand/10">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-6 opacity-20" />
                    <p className={`font-black uppercase tracking-[0.3em] text-sm ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>No technical failures detected</p>
                    <button onClick={reset} className="mt-6 text-brand text-[10px] font-black uppercase tracking-widest underline">Try another description</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view !== 'garage' && step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
              <VehicleHero image={carImage} details={carDetails} theme={theme} isVerified={isVehicleVerified} />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                       if (view !== 'options') setView('options');
                       else setStep(2);
                    }} 
                    className={`p-2.5 border rounded-xl transition-all group ${
                        theme === 'dark' ? 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white hover:border-brand/40' : 'bg-white border-brand/10 text-brand/40 hover:text-brand hover:border-brand shadow-sm'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5 rotate-180 group-active:scale-90 transition-transform" />
                  </button>
                  <div>
                    <h2 className={`text-2xl sm:text-4xl font-black uppercase tracking-tighter italic text-glow leading-none ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{selectedIssue?.title}</h2>
                    <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>{view === 'options' ? 'Mission profile selector' : view.toUpperCase()}</p>
                  </div>
                </div>

                <div className={`flex p-1.5 rounded-[1.5rem] border backdrop-blur-3xl self-start sm:self-center transition-all ${
                    theme === 'dark' ? 'bg-black/60 border-white/10 shadow-[0_16px_32px_rgba(0,0,0,0.4)]' : 'bg-white border-brand/10 shadow-xl shadow-brand/5'
                }`}>
                  {[
                    { id: 'options', label: 'Mission Overview', icon: ShieldAlert },
                    { id: 'diy', label: 'Technical Repairs', icon: Wrench },
                    { id: 'mechanics', label: 'Support Centers', icon: MapPin },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setView(tab.id as any)}
                      className={`flex items-center gap-2.5 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        view === tab.id 
                          ? 'bg-brand text-white shadow-lg shadow-brand/40 scale-[1.05]' 
                          : `${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5' : 'text-brand/40 hover:text-brand hover:bg-brand/5'}`
                      }`}
                    >
                      <tab.icon className={`w-3.5 h-3.5 ${view === tab.id ? 'animate-pulse' : ''}`} />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {view === 'options' && (
                  <motion.div 
                    key="options"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid sm:grid-cols-2 gap-6"
                  >
                    <div 
                      onClick={() => { if (!loading) handleGetDIY(); }}
                      className={`p-8 rounded-[2rem] border transition-all flex flex-col items-center text-center group ${
                          loading ? 'opacity-50 cursor-not-allowed' : `cursor-pointer ${theme === 'dark' ? 'bg-zinc-900/50 border-white/5 hover:border-brand/40 shadow-2xl' : 'bg-white border-brand/10 hover:border-brand shadow-xl shadow-brand/5'}`
                      }`}
                    >
                      <div className={`p-5 rounded-2xl mb-6 transition-all ${theme === 'dark' ? 'bg-white/5 group-hover:bg-brand/20' : 'bg-brand/5 group-hover:bg-brand/10'}`}>
                        <Wrench className={`w-10 h-10 text-brand ${loading && view === 'options' ? 'animate-pulse' : ''}`} />
                      </div>
                      <h3 className={`text-2xl font-black uppercase italic tracking-tighter mb-2 ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>DIY Repair Guide</h3>
                      <p className={`text-[13px] font-medium leading-relaxed mb-10 ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Procure components and execute technical apparatus for system remediation.</p>
                      <button 
                        disabled={loading}
                        className="mt-auto w-full py-4 bg-brand text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-brand/30 flex items-center justify-center gap-3"
                      >
                        {loading && view === 'options' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing Analysis...
                          </>
                        ) : (
                          'Initialize Repair Routine'
                        )}
                      </button>
                    </div>

                    <div 
                      onClick={() => setView('mechanics')}
                      className={`p-8 rounded-[2rem] border transition-all flex flex-col items-center text-center group cursor-pointer ${
                          theme === 'dark' ? 'bg-zinc-900/50 border-white/5 hover:border-brand/40 shadow-2xl' : 'bg-white border-brand/10 hover:border-brand shadow-xl shadow-brand/5'
                      }`}
                    >
                      <div className={`p-5 rounded-2xl mb-6 transition-all ${theme === 'dark' ? 'bg-white/5 group-hover:bg-brand/20' : 'bg-brand/5 group-hover:bg-brand/10'}`}>
                        <Navigation className="w-10 h-10 text-brand" />
                      </div>
                      <h3 className={`text-2xl font-black uppercase italic tracking-tighter mb-2 ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Expert Engagement</h3>
                      <p className={`text-[13px] font-medium leading-relaxed mb-8 ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/60'}`}>Locate certified service centers with tactical expertise in identified system faults.</p>
                      <div className="mt-auto w-full space-y-3">
                        <input 
                          type="text" 
                          placeholder="Tactical Location / Zip"
                          className={`w-full bg-black/5 rounded-2xl px-4 py-4 text-center text-sm outline-none transition-all ${
                              theme === 'dark' ? 'border-white/10 text-white focus:border-brand' : 'border-brand/10 text-brand focus:border-brand'
                          }`}
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleGetMechanics(); }}
                          className="w-full py-4 bg-brand text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] shadow-xl shadow-brand/30 transition-all font-black"
                        >
                          Scan Logistics Net
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {view === 'diy' && diyGuide && (
                  <motion.div 
                    key="diy"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    {/* Workshop Mode Trigger */}
                    <div className={`p-8 rounded-[2.5rem] border-4 border-dashed relative overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer group mb-12 ${
                      theme === 'dark' ? 'bg-zinc-900/50 border-brand/20' : 'bg-brand/5 border-brand/10'
                    }`}
                    onClick={() => {
                      setWorkshopProgress(new Array(diyGuide.steps.length).fill(false));
                      setCurrentWorkshopStep(0);
                      setWorkshopActive(true);
                      window.scrollTo(0, 0);
                    }}>
                      <div className="absolute inset-0 bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative z-10 flex flex-col items-center text-center gap-4">
                        <div className="w-16 h-16 bg-brand rounded-3xl flex items-center justify-center shadow-xl shadow-brand/40 group-hover:rotate-12 transition-transform">
                          <Hammer className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className={`text-xl font-black uppercase tracking-tighter italic ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Enter Workshop Mode</h3>
                          <p className={`text-sm italic font-medium ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Focused step-by-step guidance, timers, and safety checks</p>
                        </div>
                      </div>
                    </div>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 text-center">
                      <Timer className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
                      <div className="text-xs text-zinc-500 uppercase font-bold">Time</div>
                      <div className="font-bold">{diyGuide.estimatedTime}</div>
                    </div>
                    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 text-center">
                      <Hammer className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
                      <div className="text-xs text-zinc-500 uppercase font-bold">Difficulty</div>
                      <div className="font-bold">{diyGuide.difficulty}</div>
                    </div>
                    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 text-center">
                      <Wrench className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
                      <div className="text-xs text-zinc-500 uppercase font-bold">Tools</div>
                      <div className="font-bold">{diyGuide.tools.length} Sets</div>
                    </div>
                    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 text-center">
                      <CheckCircle2 className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
                      <div className="text-xs text-zinc-500 uppercase font-bold">Parts</div>
                      <div className="font-bold">{diyGuide.parts.length} Items</div>
                    </div>
                  </div>

                  {/* Repair Comparison Card */}
                  {diyGuide.comparison && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-8 rounded-[2.5rem] border overflow-hidden relative ${
                        theme === 'dark' ? 'bg-zinc-900/40 border-white/10 shadow-2xl' : 'bg-white border-brand/10 shadow-xl'
                      }`}
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-5 select-none">
                        <Scale className="w-32 h-32 text-brand" />
                      </div>
                      
                      <div className="relative z-10 space-y-8">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                            <Scale className="w-5 h-5 text-brand" />
                          </div>
                          <h3 className={`text-xl font-black uppercase italic tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>Trade-off Analysis</h3>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                          {/* DIY Column */}
                          <div className={`p-6 rounded-3xl space-y-4 ${theme === 'dark' ? 'bg-white/5' : 'bg-brand/5'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Hammer className="w-4 h-4 text-brand" />
                              <span className="text-sm font-black uppercase tracking-widest opacity-60">DIY Execution</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Est. Labor</p>
                                <p className="text-lg font-black italic text-brand">{diyGuide.comparison.diyTime}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Total Cost</p>
                                <p className="text-lg font-black italic text-brand">{diyGuide.comparison.diyCost}</p>
                              </div>
                            </div>
                          </div>

                          {/* Professional Column */}
                          <div className={`p-6 rounded-3xl space-y-4 ${theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-100'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <UserIcon className="w-4 h-4 text-zinc-500" />
                              <span className="text-sm font-black uppercase tracking-widest opacity-60">Expert Engagement</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Est. Turnaround</p>
                                <p className={`text-lg font-black italic ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>{diyGuide.comparison.proTime}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Total Cost</p>
                                <p className={`text-lg font-black italic ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>{diyGuide.comparison.proCost}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={`p-6 rounded-3xl border flex items-center gap-6 ${
                          theme === 'dark' ? 'bg-brand/20 border-brand/30' : 'bg-brand/5 border-brand/20'
                        }`}>
                          <div className="relative flex-shrink-0">
                            <svg className="w-20 h-20 transform -rotate-90">
                              <circle
                                cx="40"
                                cy="40"
                                r="36"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-brand/10"
                              />
                              <motion.circle
                                cx="40"
                                cy="40"
                                r="36"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="8"
                                strokeDasharray={226.2}
                                initial={{ strokeDashoffset: 226.2 }}
                                animate={{ strokeDashoffset: 226.2 - (226.2 * (diyGuide.comparison.recommendationScore || 0)) / 100 }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="text-brand"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={`text-xl font-black italic ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>
                                {diyGuide.comparison.recommendationScore}%
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1 flex-1">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">AI Recommendation Strategy</h4>
                            <p className={`text-sm font-bold italic leading-relaxed ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>
                              {diyGuide.comparison.recommendation}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Tools and Parts */}
                  <div className="grid sm:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-brand'}`}>
                        <Hammer className="w-4 h-4 text-brand" /> Technical Apparatus
                      </h3>
                      <ul className="space-y-2">
                        {diyGuide.tools.map((tool, i) => (
                          <li key={i} className={`flex items-center gap-3 text-sm p-2 rounded-lg border transition-all ${
                            theme === 'dark' ? 'text-zinc-400 bg-zinc-900/30 border-white/5' : 'text-brand/70 bg-brand/[0.02] border-brand/10'
                          }`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-brand" /> {tool}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h3 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-brand'}`}>
                        <Car className="w-4 h-4 text-brand" /> Specified Components
                      </h3>
                      <ul className="space-y-3">
                        {diyGuide.parts.map((part, i) => (
                          <li key={i} className={`p-4 rounded-xl border space-y-3 transition-all ${
                            theme === 'dark' ? 'bg-zinc-900/30 border-white/5' : 'bg-white border-brand/10 shadow-sm'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand" /> 
                                <span className={`text-sm font-black uppercase tracking-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-brand'}`}>{part.name}</span>
                              </div>
                              <span className={`text-xs font-mono font-bold ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>{part.avgPrice}</span>
                            </div>
                            
                            {part.sources && part.sources.length > 0 && (
                              <PartSourcesDropdown sources={part.sources} theme={theme} />
                            )}
                            
                            {part.ecoLabel && (
                              <div className={`grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest pt-2 border-t ${theme === 'dark' ? 'border-white/5' : 'border-brand/10'}`}>
                                <div className="flex flex-col gap-1">
                                  <span className={theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}>New Part Impact</span>
                                  <span className="text-red-500/80">{part.ecoLabel.carbonImpactNew}</span>
                                </div>
                                <div className={`flex flex-col gap-1 border-l pl-2 ${theme === 'dark' ? 'border-white/5' : 'border-brand/10'}`}>
                                  <span className="text-green-600 flex items-center gap-1">Remanufactured <Leaf className="w-2 h-2" /></span>
                                  <span className="text-green-500">{part.ecoLabel.carbonImpactReman}</span>
                                </div>
                                <div className={`col-span-2 pt-1 italic lowercase tracking-normal font-medium ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/50'}`}>
                                  {part.ecoLabel.savingsDescription}
                                </div>
                              </div>
                            )}

                            {part.purchaseUrl && (
                              <div className={`pt-3 border-t ${theme === 'dark' ? 'border-white/5' : 'border-brand/10'}`}>
                                <a 
                                  href={part.purchaseUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="w-full py-2 bg-brand/10 hover:bg-brand/20 border border-brand/20 rounded-lg text-[10px] font-black uppercase tracking-widest text-brand flex items-center justify-center gap-2 transition-all shadow-sm"
                                >
                                  Get from {part.retailerName || 'Retailer'} <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-6">
                    <h3 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 border-b pb-4 ${theme === 'dark' ? 'border-white/10 text-zinc-300' : 'border-brand/10 text-brand'}`}>
                      <Timer className="w-4 h-4 text-brand" /> Procedural Execution
                    </h3>
                    <div className="space-y-4">
                      {diyGuide.steps.map((step, i) => (
                        <div key={i} className={`flex items-center gap-6 p-6 rounded-3xl border transition-all ${
                          theme === 'dark' ? 'bg-zinc-900/50 border-white/5 text-zinc-300' : 'bg-white border-brand/10 text-brand/80 shadow-sm'
                        }`}>
                          <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-brand text-white flex items-center justify-center font-black italic text-sm shadow-xl shadow-brand/20">
                            {i + 1}
                          </div>
                          <p className="text-sm leading-relaxed font-bold italic">{stripBold(step)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Disposal Advice & Recycling Centers */}
                  <div className="space-y-6 pt-8 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-green-500">
                        <Recycle className="w-4 h-4" /> Hazardous Material Protocol
                      </h3>
                    </div>
                    
                    {diyGuide.disposalAdvice && (
                      <div className="bg-green-500/5 border border-green-500/10 p-4 rounded-2xl">
                         <div className="flex gap-3">
                            <ShieldAlert className="w-5 h-5 text-green-500 flex-shrink-0" />
                            <p className="text-sm text-green-200/80 leading-relaxed italic">"{stripBold(diyGuide.disposalAdvice)}"</p>
                         </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Closest Hazardous Waste Disposal Centers</p>
                      <div className="grid gap-4">
                        {recyclingCenters.length > 0 ? recyclingCenters.map((center, i) => (
                          <div key={i} className="bg-zinc-900/30 p-4 rounded-xl border border-white/5 flex justify-between items-center group">
                            <div className="space-y-1">
                              <h4 className="font-bold text-sm text-zinc-300">{center.name}</h4>
                              <p className="text-[10px] text-zinc-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {center.address}</p>
                              <div className="flex gap-2 pt-1">
                                {center.acceptedItems.slice(0, 3).map((item, j) => (
                                  <span key={j} className="text-[8px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-bold uppercase tracking-tighter">{item}</span>
                                ))}
                              </div>
                            </div>
                            <button title="Open in Navigation" className="p-2 bg-zinc-800 rounded-lg group-hover:bg-green-600 transition-colors">
                               <Navigation className="w-4 h-4" />
                            </button>
                          </div>
                        )) : (
                          <div className="text-center py-8 bg-zinc-900/10 rounded-2xl border border-dashed border-white/5">
                             <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest italic">Scanning for local facilities...</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tutorial Resources */}
                  <div className="space-y-6">
                    <h3 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 border-b pb-4 ${theme === 'dark' ? 'border-white/10 text-zinc-300' : 'border-brand/10 text-brand'}`}>
                      <Youtube className="w-4 h-4 text-red-500" /> Professional Tutorial Resources
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {diyGuide.videos.map((vid, i) => (
                        <a 
                          key={i} 
                          href={vid.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-6 rounded-[2rem] border transition-all flex flex-col gap-4 group hover:scale-[1.02] active:scale-[0.98] ${
                            theme === 'dark' ? 'bg-zinc-900 border-white/5 hover:border-brand/40 shadow-2xl' : 'bg-white border-brand/10 hover:border-brand shadow-sm shadow-brand/5'
                          }`}
                        >
                           <div className="flex items-center justify-between">
                             <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-all text-brand">
                               <Youtube className="w-6 h-6" />
                             </div>
                             <div className={`p-2.5 rounded-xl transition-all ${theme === 'dark' ? 'bg-white/5 text-zinc-500 group-hover:bg-brand group-hover:text-white' : 'bg-brand/5 text-brand/40 group-hover:bg-brand group-hover:text-white'}`}>
                               <ExternalLink className="w-4 h-4" />
                             </div>
                           </div>
                           <div>
                              <h4 className={`font-black text-sm uppercase tracking-tight italic line-clamp-2 ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{vid.title}</h4>
                              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-2 group-hover:text-brand transition-colors">View on YouTube <span className="text-brand">→</span></p>
                           </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {view === 'mechanics' && mechanics.length > 0 && (
                <motion.div 
                  key="mechanics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className={`p-4 rounded-2xl flex gap-3 text-sm border transition-all ${
                    theme === 'dark' ? 'bg-brand/10 border-brand/20 text-brand' : 'bg-brand/5 border-brand/10 text-brand'
                  }`}>
                    <Navigation className="w-5 h-5 text-brand flex-shrink-0" />
                    <p className="font-bold opacity-80">Found {mechanics.length} top-rated shops near your area prepared for this fix.</p>
                  </div>
                  
                  <div className="grid gap-4">
                    {mechanics.map((mech, i) => (
                      <div key={i} className={`p-6 rounded-[2rem] border transition-all flex justify-between items-center group ${
                        theme === 'dark' ? 'bg-zinc-900/50 border-white/5 hover:border-brand/30 shadow-2xl' : 'bg-white border-brand/10 hover:border-brand shadow-lg shadow-brand/5'
                      }`}>
                        <div className="space-y-2">
                          <h3 className={`font-black text-xl uppercase italic tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>{mech.name}</h3>
                          <div className="flex items-center gap-2">
                            <div className="flex text-brand">
                              {Array.from({ length: 5 }).map((_, j) => (
                                <Star key={j} className={`w-3 h-3 ${j < Math.floor(mech.rating) ? 'fill-current' : 'opacity-20'}`} />
                              ))}
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>{mech.rating} Protocol Rating</span>
                          </div>
                          <p className={`text-sm font-medium flex items-center gap-1.5 ${theme === 'dark' ? 'text-zinc-400' : 'text-brand/60'}`}><MapPin className="w-3.5 h-3.5" /> {mech.address}</p>
                          {mech.phone && <p className={`text-xs font-mono font-bold ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/30'}`}>{mech.phone}</p>}
                        </div>
                        <button title="Get Directions" className={`p-4 rounded-2xl transition-all shadow-xl group-hover:scale-110 active:scale-95 ${
                            theme === 'dark' ? 'bg-zinc-800 group-hover:bg-brand text-brand group-hover:text-white' : 'bg-brand/5 group-hover:bg-brand text-brand group-hover:text-white'
                        }`}>
                           <Navigation className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </main>

      <AnimatePresence>
        {isInitialBoot && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }}
            className={`fixed inset-0 z-[200] flex flex-col items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
              animate={{ 
                scale: [0.8, 1.05, 1], 
                opacity: 1,
                rotate: 0,
              }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative mb-16"
            >
              <div className="absolute inset-0 blur-[100px] bg-brand/30 animate-pulse scale-150" />
              <img src={logo} alt="CarDoc Splash" className="w-80 h-80 object-contain relative z-10" />
            </motion.div>
            
            <div className="flex flex-col items-center gap-10">
              <div className="space-y-4 text-center">
                <h2 className={`text-xl font-black uppercase tracking-[1em] text-glow ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>CarDoc Neural</h2>
                <div className={`h-0.5 w-64 rounded-full overflow-hidden relative ${theme === 'dark' ? 'bg-white/5' : 'bg-brand/5'}`}>
                  <motion.div 
                    initial={{ left: '-100%' }}
                    animate={{ left: '100%' }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_20px_var(--color-brand)]"
                  />
                </div>
                <p className={`text-[9px] font-black uppercase tracking-[0.6em] ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/30'}`}>
                  Initializing Secure Node
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[100] backdrop-blur-md flex flex-col items-center justify-center p-4 text-center ${theme === 'dark' ? 'bg-black/80' : 'bg-white/90'}`}
          >
            <div className="relative">
              <div className="absolute inset-0 animate-pulse bg-brand/30 blur-[100px] rounded-full" />
              <div className={`relative z-10 w-24 h-24 rounded-[2rem] border-2 flex items-center justify-center mb-8 ${
                  theme === 'dark' ? 'bg-black border-brand/50 shadow-2xl shadow-brand/40' : 'bg-white border-brand/20 shadow-xl shadow-brand/20'
              }`}>
                <Loader2 className="w-10 h-10 animate-spin text-brand" />
              </div>
            </div>
            <h2 className={`text-2xl font-black uppercase tracking-tighter italic text-glow mb-2 ${theme === 'dark' ? 'text-white' : 'text-brand'}`}>
              <LoadingMessage />
            </h2>
            <p className={`max-w-xs font-semibold uppercase tracking-widest text-[8px] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>
              Synchronizing symptoms with global repair intelligence.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-6xl mx-auto px-4 py-24 text-center space-y-10">
        <div className="flex items-center gap-6">
          <div className="h-[2px] bg-brand/10 flex-grow" />
          <div className="flex gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-brand shadow-[0_0_10px_var(--color-brand)] animate-pulse" />
            <div className="w-2.5 h-2.5 rounded-full bg-brand/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-brand/10" />
          </div>
          <div className="h-[2px] bg-brand/10 flex-grow" />
        </div>
        
        <div className="space-y-4">
          <h4 className={`text-[10px] font-black uppercase tracking-[0.5em] ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>System Protocol / Data Disclaimer</h4>
          <p className={`text-[10px] leading-relaxed max-w-xl mx-auto font-black uppercase tracking-widest italic ${theme === 'dark' ? 'text-zinc-600' : 'text-brand/40'}`}>
            NOTICE: CarDoc neural engine provides estimations for technical guidance. Standard mechanical inspection remains mandatory for mission-critical safety systems.
          </p>
        </div>
        
        <div className="flex justify-center gap-12 text-[9px] font-black uppercase tracking-[0.2em] italic">
           <span className={`transition-colors cursor-default ${theme === 'dark' ? 'text-zinc-700' : 'text-brand/20'}`}>NODE_V1.3.2_STABLE</span>
           <span className={`transition-colors cursor-pointer hover:text-brand ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Compliance</span>
           <span className={`transition-colors cursor-pointer hover:text-brand ${theme === 'dark' ? 'text-zinc-500' : 'text-brand/40'}`}>Privacy Protocols</span>
        </div>
      </footer>
      {/* Workshop Mode Overlay */}
      <AnimatePresence>
        {workshopActive && diyGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black backdrop-blur-3xl overflow-y-auto"
          >
            <div className="max-w-3xl mx-auto px-6 py-12 min-h-screen flex flex-col">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center mb-20 relative w-full">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setWorkshopActive(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 border border-white/5 text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all rounded-xl uppercase text-[9px] font-black tracking-widest"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Exit</span>
                  </button>
                  <button 
                    onClick={() => setGreaseMode(!greaseMode)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all border relative overflow-hidden group ${
                      greaseMode 
                        ? 'bg-brand text-white border-brand shadow-[0_0_20px_rgba(0,53,122,0.4)]' 
                        : 'bg-zinc-900/50 text-zinc-500 border-white/5 hover:border-brand/40'
                    }`}
                  >
                    {greaseMode && (
                      <span className="absolute inset-0 bg-brand/40 pulse-ring pointer-events-none" />
                    )}
                    <div className="relative z-10 flex items-center gap-2">
                       {greaseMode ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
                       <div className="flex flex-col items-start leading-none uppercase">
                         <span className="text-[9px] font-black tracking-widest">Grease Mode</span>
                         <span className={`text-[7px] font-bold tracking-tighter opacity-70 ${greaseMode ? 'text-white' : 'text-zinc-600'}`}>
                           {greaseMode ? 'Voice Intel Active' : 'Radio Silence'}
                         </span>
                       </div>
                    </div>
                  </button>
                </div>

                <div className="flex items-center justify-center relative px-12">
                  {/* Progress Line Track */}
                  <div className="absolute inset-x-12 h-px bg-zinc-800 top-1/2 -translate-y-1/2 z-0" />
                  
                  {/* Progress Line Active */}
                  <motion.div 
                    initial={false}
                    animate={{ 
                      width: `${(workshopProgress.filter(Boolean).length / (diyGuide.steps.length - 1 || 1)) * 100}%` 
                    }}
                    className="absolute left-12 h-px bg-brand top-1/2 -translate-y-1/2 z-0 origin-left"
                    style={{ maxWidth: 'calc(100% - 96px)' }}
                  />

                  <div className="flex items-center gap-12 relative z-10 w-full justify-between">
                    {diyGuide.steps.map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => setCurrentWorkshopStep(i)}
                        className={`group relative flex flex-col items-center gap-2 transition-all`}
                      >
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                          currentWorkshopStep === i 
                            ? 'bg-brand text-white rotate-45 scale-125 shadow-[0_0_15px_rgba(255,107,0,0.5)]' 
                            : workshopProgress[i]
                              ? 'bg-green-500 text-white rounded-full'
                              : 'bg-zinc-950 text-zinc-600 border border-white/10 hover:border-brand/40'
                        }`}>
                          <span className={`text-[9px] font-black ${currentWorkshopStep === i ? '-rotate-45' : ''}`}>
                            {i + 1}
                          </span>
                        </div>
                        
                        {/* Status Label */}
                        <div className={`absolute -bottom-6 whitespace-nowrap text-[8px] font-black uppercase tracking-widest transition-all ${
                          currentWorkshopStep === i ? 'text-brand opacity-100' : 'text-zinc-600 opacity-0 group-hover:opacity-100'
                        }`}>
                          {currentWorkshopStep === i ? 'Active' : workshopProgress[i] ? 'Done' : `Step ${i + 1}`}
                        </div>

                        {currentWorkshopStep === i && (
                          <motion.div 
                            layoutId="active-step-glow"
                            className="absolute -inset-2 bg-brand/10 blur-md rounded-full -z-10"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                       <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
                        PHASE {currentWorkshopStep + 1}
                      </span>
                      <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                    </div>
                    {diyGuide.sustainabilityScore && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/5 border border-green-500/10">
                        <Leaf className="w-2.5 h-2.5 text-green-500" />
                        <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">{diyGuide.sustainabilityScore}% ECO</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hackathon Context Bar */}
              <div className="flex flex-wrap gap-4 mb-12 justify-center">
                {[
                  { icon: Leaf, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Sustainability Score', value: `${diyGuide.sustainabilityScore || 0}% Landfill Avoidance` },
                  { icon: ShieldCheck, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', label: 'Healthcare & Wellness', value: 'Ergonomic Support' },
                  { icon: LayoutGrid, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Business & Enterprise', value: `Value Gain: ${selectedIssue?.marketValueImpact || 'TBD'}` },
                  { icon: Wrench, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Education & Mastery', value: 'Physics-Based Guidance' }
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border ${item.bg} ${item.border} group transition-all cursor-default`}>
                    <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-100">{item.label}</span>
                      <span className="text-[7px] font-bold text-zinc-500 tracking-wider whitespace-nowrap">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Step Content */}
                <div className="flex-1 flex flex-col justify-center py-12">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentWorkshopStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-8"
                  >
                    <div className="grid lg:grid-cols-3 gap-12">
                      <div className="lg:col-span-2 space-y-8">
                        <div className="flex items-start gap-8">
                          <div className="w-16 h-16 rounded-[2rem] bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-2xl shadow-brand/40 text-2xl font-black italic">
                            {currentWorkshopStep + 1}
                          </div>
                          <div className="space-y-6">
                            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter italic text-white leading-none text-glow">
                              {stripBold(diyGuide.steps[currentWorkshopStep])}
                            </h2>
                            
                            <div className="h-[2px] w-full bg-gradient-to-r from-brand/40 to-transparent" />

                            {/* Dynamic Step Content (Fake Timer if needed) */}
                            {diyGuide.steps[currentWorkshopStep].toLowerCase().includes('wait') || diyGuide.steps[currentWorkshopStep].toLowerCase().includes('drain') ? (
                              <div className="p-8 bg-brand/10 border border-brand/20 rounded-[2.5rem] group shadow-2xl">
                                <div className="flex items-center justify-between gap-6 flex-wrap">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-brand/20 flex items-center justify-center animate-spin-slow">
                                      <Timer className="w-6 h-6 text-brand" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-black text-white uppercase tracking-widest">Procedural Wait Required</span>
                                      <span className="text-[10px] font-bold text-brand uppercase tracking-widest opacity-60">Accuracy within 0.1s</span>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => setWorkshopTimer(600)} 
                                    className="px-8 py-4 bg-brand text-white text-xs font-black uppercase tracking-[0.2em] italic rounded-2xl shadow-xl shadow-brand/40 hover:scale-105 active:scale-95 transition-all"
                                  >
                                    {workshopTimer ? `${Math.floor(workshopTimer / 60)}:${(workshopTimer % 60).toString().padStart(2, '0')}` : 'Initialize Timer'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-4 text-zinc-500 italic text-sm font-bold bg-white/5 p-4 rounded-2xl border border-white/5">
                                <ShieldCheck className="w-6 h-6 text-green-500" />
                                Safety protocol verified. Structural integrity confirmed. Proceed to execute.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {diyGuide.safetyProtocol && diyGuide.safetyProtocol[currentWorkshopStep] && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-6 rounded-[2.2rem] bg-purple-500/10 border border-purple-500/20 space-y-4 shadow-2xl shadow-purple-500/10"
                          >
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                                 <ShieldCheck className="w-4 h-4 text-purple-500" />
                               </div>
                               <span className="text-xs font-black uppercase tracking-[0.2em] text-purple-400">Biological Safety</span>
                             </div>
                             <p className="text-xs text-zinc-300 font-bold leading-relaxed italic opacity-80">{diyGuide.safetyProtocol[currentWorkshopStep]}</p>
                          </motion.div>
                        )}
                        {diyGuide.stepInsights && diyGuide.stepInsights[currentWorkshopStep] && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="p-6 rounded-[2.2rem] bg-orange-500/10 border border-orange-500/20 space-y-4 shadow-2xl shadow-orange-500/10"
                          >
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                 <Wrench className="w-4 h-4 text-orange-500" />
                               </div>
                               <span className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Mastery Data</span>
                             </div>
                             <p className="text-xs text-zinc-300 font-bold leading-relaxed italic opacity-80">{diyGuide.stepInsights[currentWorkshopStep]}</p>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-4 py-8 border-t border-white/5">
                <button 
                  onClick={() => setCurrentWorkshopStep(Math.max(0, currentWorkshopStep - 1))}
                  disabled={currentWorkshopStep === 0}
                  className="px-6 py-4 rounded-2xl bg-zinc-900 border border-white/5 text-zinc-400 font-bold disabled:opacity-30 disabled:grayscale transition-all hover:bg-zinc-800"
                >
                  Previous
                </button>
                {currentWorkshopStep === diyGuide.steps.length - 1 ? (
                  <button 
                    onClick={() => {
                      const newProgress = [...workshopProgress];
                      newProgress[currentWorkshopStep] = true;
                      setWorkshopProgress(newProgress);
                      setWorkshopActive(false);
                      setView('garage'); // Go check health score
                    }}
                    className="flex-1 px-8 py-4 bg-green-600 rounded-2xl text-white font-black uppercase tracking-[0.2em] italic shadow-xl shadow-green-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    Finish Repair & Update Logs <CheckCircle2 className="w-5 h-5" />
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      const newProgress = [...workshopProgress];
                      newProgress[currentWorkshopStep] = true;
                      setWorkshopProgress(newProgress);
                      setCurrentWorkshopStep(currentWorkshopStep + 1);
                    }}
                    className="flex-1 px-8 py-4 bg-brand rounded-2xl text-white font-black uppercase tracking-[0.2em] italic shadow-xl shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Next Step
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
