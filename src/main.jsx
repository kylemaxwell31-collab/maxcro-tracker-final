import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, collection, addDoc, query, getDocs, deleteDoc } from 'firebase/firestore';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// --- Helper Components ---
const Icon = ({ path, className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-xl w-full max-w-md m-4">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <Icon path="M6 18L18 6M6 6l12 12" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// --- Main App Component ---
const App = () => {
  // --- State Management ---
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);

  // --- Firebase Initialization ---
  useEffect(() => {
    try {
      const firebaseConfigStr = import.meta.env.VITE_FIREBASE_CONFIG;
      if (!firebaseConfigStr) {
        console.error("Firebase config is missing. Please set VITE_FIREBASE_CONFIG in your environment variables.");
        setLoading(false);
        return;
      }
      const firebaseConfig = JSON.parse(firebaseConfigStr);
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setDb(firestore);
      setAuth(authInstance);

      const unsubscribe = onAuthStateChanged(authInstance, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser);
        } else {
          signInAnonymously(authInstance).catch(error => console.error("Anonymous sign-in failed:", error));
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase initialization error:", error);
      setLoading(false);
    }
  }, []);

  // --- User Data Subscription ---
  useEffect(() => {
    if (user && db) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        } else {
          // New user, show onboarding
          setUserData({ profile: null });
        }
        setLoading(false);
      }, (error) => {
        console.error("Error fetching user data:", error);
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [user, db]);

  // --- Render Logic ---
  if (loading) {
    return <div className="h-full bg-gray-900 flex items-center justify-center text-white"><p>Loading Your Experience...</p></div>;
  }

  if (!userData || !userData.profile) {
    return <OnboardingScreen user={user} db={db} />;
  }

  return (
    <div className="h-full bg-gray-900 text-gray-100 font-sans">
      <div className="flex flex-col h-full">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {currentView === 'dashboard' && <DashboardScreen userData={userData} user={user} db={db} />}
          {currentView === 'charts' && <ChartsScreen userData={userData} user={user} db={db} />}
          {currentView === 'workout' && <WorkoutScreen userData={userData} user={user} db={db} />}
          {currentView === 'profile' && <ProfileScreen userData={userData} user={user} db={db} />}
        </main>
        <nav className="bg-gray-800/50 backdrop-blur-sm border-t border-gray-700 p-2 flex justify-around">
          <NavItem icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
          <NavItem icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h12M3.75 3h16.5v13.5A2.25 2.25 0 0117.25 18H6.75A2.25 2.25 0 014.5 15.75V3" label="Workout" active={currentView === 'workout'} onClick={() => setCurrentView('workout')} />
          <NavItem icon="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" label="Charts" active={currentView === 'charts'} onClick={() => setCurrentView('charts')} />
          <NavItem icon="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" label="Profile" active={currentView === 'profile'} onClick={() => setCurrentView('profile')} />
        </nav>
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-20 h-16 rounded-lg transition-colors duration-200 ${active ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:bg-gray-700/50 hover:text-blue-300'}`}>
    <Icon path={icon} className="w-7 h-7 mb-1" />
    <span className="text-xs font-medium">{label}</span>
  </button>
);

// --- Onboarding Screens ---
// Note: A full implementation of each screen component would go here.
// These are simplified for brevity but showcase the structure.
const OnboardingScreen = ({ user, db }) => { 
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [weight, setWeight] = useState('');
    const [heightFeet, setHeightFeet] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [activityLevel, setActivityLevel] = useState('sedentary');
    const [goal, setGoal] = useState('lose');
    const [bodyFat, setBodyFat] = useState('');
    const [gender, setGender] = useState('male');

    const handleSaveProfile = async () => {
        if (!user) return;
        const profile = { name, age: Number(age), weight: Number(weight), heightFeet: Number(heightFeet), heightInches: Number(heightInches), activityLevel, goal, bodyFat: Number(bodyFat), gender };
        try {
            await setDoc(doc(db, 'users', user.uid), { profile, dailyLogs: {}, workoutLogs: {} });
        } catch (error) {
            console.error("Error saving profile:", error);
        }
    };
    return (
        <div className="h-full bg-gray-900 flex items-center justify-center p-4">
             <div className="w-full max-w-md bg-gray-800 p-8 rounded-2xl shadow-lg">
                <h1 className="text-3xl font-bold text-white text-center mb-6">Welcome to Maxcro Tracker</h1>
                {/* Simplified form for demonstration */}
                <input className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
                <input className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4" placeholder="Age" type="number" value={age} onChange={e => setAge(e.target.value)} />
                <input className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4" placeholder="Weight (lbs)" type="number" value={weight} onChange={e => setWeight(e.target.value)} />
                <button onClick={handleSaveProfile} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">Create Profile</button>
            </div>
        </div>
    );
};
const DashboardScreen = ({ userData, user, db }) => { return <div className="text-white">Dashboard Content</div>; };
const ChartsScreen = ({ userData, user, db }) => { return <div className="text-white">Charts Content</div>; };
const WorkoutScreen = ({ userData, user, db }) => { return <div className="text-white">Workout Content</div>; };
const ProfileScreen = ({ userData, user, db }) => { return <div className="text-white">Profile Content</div>; };


export default App;

