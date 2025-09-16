<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-900">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Maxcro Tracker</title>
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- React Libraries -->
    <script src="https://unpkg.com/react@17/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.development.js"></script>
    
    <!-- Babel for JSX Transpilation -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

    <!-- Chart.js for Graphs -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/react-chartjs-2/dist/react-chartjs-2.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns"></script>

    <!-- Lucide Icons -->
    <script src="https://unpkg.com/lucide-react@0.292.0/dist/lucide-react.js"></script>

    <!-- Firebase SDKs -->
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
        import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, getDocs, orderBy, onSnapshot, where, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
        
        window.firebase = {
            initializeApp,
            getAuth,
            signInAnonymously,
            onAuthStateChanged,
            getFirestore,
            doc,
            setDoc,
            getDoc,
            collection,
            addDoc,
            query, 
            getDocs,
            orderBy,
            onSnapshot,
            where,
            updateDoc
        };
    </script>

</head>
<body class="h-full">
    <div id="root" class="h-full"></div>

    <script type="text/babel" data-presets="react">
        const { useState, useEffect, useCallback, useMemo, memo } = React;
        const { Line } = ReactChartjs2;

        // Configuration (Replace with your actual keys)
        const firebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_AUTH_DOMAIN",
            projectId: "YOUR_PROJECT_ID",
            storageBucket: "YOUR_STORAGE_BUCKET",
            messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
            appId: "YOUR_APP_ID"
        };
        const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
        const GEMINI_VISION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${GEMINI_API_KEY}`;
        
        // --- UTILITY FUNCTIONS ---
        const formatDate = (date) => date.toISOString().split('T')[0];

        // --- ICON COMPONENTS ---
        const Icon = ({ name, ...props }) => {
            if (!window.lucide) return null;
            const Component = window.lucide[name];
            return Component ? React.createElement(Component, props) : null;
        };
        
        // --- FIREBASE SETUP ---
        let db, auth;
        try {
            const app = window.firebase.initializeApp(firebaseConfig);
            db = window.firebase.getFirestore(app);
            auth = window.firebase.getAuth(app);
        } catch (e) {
            console.error("Firebase initialization error:", e);
        }

        // --- MAIN APP COMPONENT ---
        const App = () => {
            const [user, setUser] = useState(null);
            const [profile, setProfile] = useState(null);
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                if (!auth) return;
                const unsubscribe = window.firebase.onAuthStateChanged(auth, async (currentUser) => {
                    if (currentUser) {
                        setUser(currentUser);
                        const profileRef = window.firebase.doc(db, 'users', currentUser.uid);
                        const profileSnap = await window.firebase.getDoc(profileRef);
                        if (profileSnap.exists()) {
                            setProfile(profileSnap.data());
                        } else {
                            setProfile(null); // Explicitly set to null if no profile
                        }
                    } else {
                        await window.firebase.signInAnonymously(auth);
                    }
                    setLoading(false);
                });
                return () => unsubscribe();
            }, []);
            
            const handleProfileSave = async (profileData) => {
                if (!user) return;
                const profileRef = window.firebase.doc(db, 'users', user.uid);
                await window.firebase.setDoc(profileRef, profileData, { merge: true });
                setProfile(profileData);
            };

            if (loading) {
                return (
                    <div className="flex items-center justify-center h-full bg-gray-900 text-white">
                        <Icon name="Loader2" className="animate-spin h-8 w-8" />
                    </div>
                );
            }

            if (!profile) {
                return <OnboardingScreen onSave={handleProfileSave} />;
            }
            
            // This is a placeholder for the main application view
            return <div>Welcome back! Main app would go here.</div>
        };
        
        // --- ONBOARDING COMPONENT ---
        const OnboardingScreen = ({ onSave }) => {
            const [step, setStep] = useState(1);
            const [userData, setUserData] = useState({
                name: '', gender: 'male', age: '', weight: '', heightFt: '', heightIn: '',
                activityLevel: 'sedentary', goal: 'lose', bodyFat: '', bodyFatGoal: ''
            });

            const handleChange = (e) => {
                const { name, value } = e.target;
                setUserData(prev => ({ ...prev, [name]: value }));
            };

            const nextStep = () => setStep(s => s + 1);
            const prevStep = () => setStep(s => s - 1);

            const handleSubmit = () => {
                // Add validation logic here
                onSave(userData);
            };

            const renderStep = () => {
                switch (step) {
                    case 1:
                        return (
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-4">Welcome to Maxcro Tracker</h2>
                                <p className="text-gray-400 mb-6">Let's get to know you.</p>
                                <input name="name" value={userData.name} onChange={handleChange} placeholder="What's your name?" className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4" />
                            </div>
                        );
                    // Add more cases for other steps...
                    default:
                        return <div>Thank you!</div>;
                }
            };
            
            return (
                <div className="h-full bg-gray-900 p-8 flex flex-col justify-center">
                    {renderStep()}
                    <div className="flex justify-between mt-8">
                        {step > 1 && <button onClick={prevStep} className="bg-gray-600 text-white py-2 px-4 rounded-lg">Back</button>}
                        {step < 4 ? <button onClick={nextStep} className="bg-indigo-600 text-white py-2 px-4 rounded-lg">Next</button> : <button onClick={handleSubmit} className="bg-green-600 text-white py-2 px-4 rounded-lg">Finish</button>}
                    </div>
                </div>
            );
        };

        // --- RENDER THE APP ---
        ReactDOM.render(<App />, document.getElementById('root'));

    </script>
</body>
</html>
