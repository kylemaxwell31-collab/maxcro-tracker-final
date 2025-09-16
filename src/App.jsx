import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, setLogLevel } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Camera, BarChart2, User, BookOpen, Sun, Moon, Plus, Image as ImageIcon, Send, X as XIcon, Loader2, Sparkles, Dumbbell, Lightbulb, ClipboardList, Replace } from 'lucide-react';

// --- Environment-Safe Configuration ---
// These keys will be securely loaded from Netlify's environment variables
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}');
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const appId = 'maxcro-tracker-live'; // A static ID for the deployed app

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const calculateMacros = (profileData) => {
    const { weightLbs, heightFeet, heightInches, age, gender, activityLevel } = profileData;
    if (!weightLbs || !heightFeet || !age || !gender || !activityLevel) return { workout: {}, rest: {} };
    const weightKg = parseFloat(weightLbs) * 0.453592;
    const heightCm = (parseInt(heightFeet) * 12 + parseInt(heightInches || 0)) * 2.54;
    let bmr = (gender === 'male')
        ? (10 * weightKg + 6.25 * heightCm - 5 * parseInt(age) + 5)
        : (10 * weightKg + 6.25 * heightCm - 5 * parseInt(age) - 161);
    const activityMultipliers = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725, extra_active: 1.9 };
    const tdee = bmr * activityMultipliers[activityLevel];
    const deficit = tdee * 0.20;
    const targetCalories = tdee - deficit;
    const protein = Math.round(weightKg * 2.2);
    const fat = Math.round((targetCalories * 0.25) / 9);
    const carbs = Math.round((targetCalories - (protein * 4) - (fat * 9)) / 4);
    return {
        bmr: Math.round(bmr), tdee: Math.round(tdee), deficit: Math.round(deficit),
        workout: { protein, carbs, fat, calories: Math.round(targetCalories) },
        rest: { protein, carbs: Math.round(carbs * 0.8), fat, calories: Math.round(targetCalories * 0.9) }
    };
};

// --- Main App Component ---
export default function App() {
    const [screen, setScreen] = useState('loading');
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [dailyData, setDailyData] = useState({});
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    useEffect(() => {
        setLogLevel('debug');
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const profileRef = doc(db, `artifacts/${appId}/users/${currentUser.uid}/profile/main`);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    setProfile(profileSnap.data());
                    setScreen('dashboard');
                } else {
                    setScreen('onboarding');
                }
            } else {
                try {
                     await signInAnonymously(auth);
                } catch (error) {
                    console.error("Authentication Error:", error);
                    setScreen('error');
                }
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        const dailyEntriesQuery = query(collection(db, `artifacts/${appId}/users/${user.uid}/dailyEntries`));
        const unsubscribe = onSnapshot(dailyEntriesQuery, (snapshot) => {
            const data = {};
            snapshot.forEach(doc => { data[doc.id] = doc.data(); });
            setDailyData(data);
            setIsDataLoaded(true);
        }, (error) => console.error("Error fetching daily entries:", error));
        return () => unsubscribe();
    }, [user]);

    const handleOnboardingComplete = useCallback((newProfile) => {
        setProfile(newProfile);
        setScreen('dashboard');
    }, []);
    
    const renderContent = () => {
        if (!firebaseConfig.apiKey || !GEMINI_API_KEY) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                    <h1 className="text-2xl font-bold text-red-500">Configuration Error</h1>
                    <p className="text-gray-400 mt-2">The application is missing necessary API keys. Please ensure environment variables are set correctly in the deployment settings.</p>
                </div>
            )
        }
        if (screen === 'loading' || (user && !isDataLoaded)) {
            return <LoadingScreen />;
        }
        if (screen === 'onboarding') {
            return <OnboardingScreen user={user} onComplete={handleOnboardingComplete} />;
        }
        if (screen === 'dashboard' && profile) {
            return <Dashboard user={user} profile={profile} setProfile={setProfile} dailyData={dailyData} />;
        }
        if (screen === 'error') {
            return <div className="text-red-500 text-center p-8">An authentication error occurred. Please refresh.</div>
        }
        return <LoadingScreen />;
    };

    return (
        <main className="bg-gray-900 text-white font-sans min-h-screen antialiased">
            <div className="container mx-auto max-w-lg p-0 h-full">
                {renderContent()}
            </div>
        </main>
    );
}

// --- Screens & Components (Memoized for Performance) ---

const LoadingScreen = React.memo(() => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-16 h-16 text-indigo-400 animate-spin mb-4" />
        <h1 className="text-2xl font-bold text-gray-300">Maxcro Tracker</h1>
        <p className="text-gray-500">Loading your personalized dashboard...</p>
    </div>
));


const OnboardingScreen = React.memo(({ user, onComplete }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ name: '', age: '', gender: 'male', heightFeet: '', heightInches: '', weightLbs: '', activityLevel: 'lightly_active', bfGoal: '20' });
    const handleChange = useCallback((e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); }, []);
    const handleSubmit = useCallback(async () => {
        const calculationResult = calculateMacros(formData);
        const goals = { workout: calculationResult.workout, rest: calculationResult.rest };
        const finalProfile = { ...formData, goals, lastPhotoUploadDate: null };
        const profileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/main`);
        await setDoc(profileRef, finalProfile);
        onComplete(finalProfile);
    }, [formData, user, onComplete]);
    const nextStep = useCallback(() => setStep(s => s + 1), []);
    const prevStep = useCallback(() => setStep(s => s - 1), []);

    const renderStep = () => {
        switch(step) {
            case 1: return <OnboardingStep1 data={formData} onChange={handleChange} next={nextStep} />;
            case 2: return <OnboardingStep2 data={formData} onChange={handleChange} next={nextStep} prev={prevStep} />;
            case 3: return <OnboardingStep3 data={formData} onChange={handleChange} submit={handleSubmit} prev={prevStep} />;
            default: return <OnboardingStep1 data={formData} onChange={handleChange} next={nextStep} />;
        }
    }
    return (
        <div className="min-h-screen bg-gray-900 flex flex-col justify-center p-6">
            <h1 className="text-3xl font-bold text-center text-white mb-2">Welcome to Maxcro Tracker</h1>
            <p className="text-gray-400 text-center mb-8">Let's set up your profile.</p>
            {renderStep()}
        </div>
    );
});

const OnboardingInput = React.memo(({ label, ...props }) => (<div className="mb-4"><label className="block text-sm font-medium text-gray-400 mb-2">{label}</label><input className="w-full bg-gray-800 border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" {...props} /></div>));
const OnboardingSelect = React.memo(({ label, children, ...props }) => (<div className="mb-4"><label className="block text-sm font-medium text-gray-400 mb-2">{label}</label><select className="w-full bg-gray-800 border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition appearance-none" {...props}>{children}</select></div>));
const OnboardingStep1 = React.memo(({ data, onChange, next }) => (<Card><h2 className="text-xl font-semibold mb-4 text-center">About You</h2><OnboardingInput label="Name" name="name" value={data.name} onChange={onChange} placeholder="e.g. Alex Doe" /><OnboardingInput label="Age" name="age" type="number" value={data.age} onChange={onChange} placeholder="e.g. 28" /><OnboardingSelect label="Gender" name="gender" value={data.gender} onChange={onChange}><option value="male">Male</option><option value="female">Female</option></OnboardingSelect><button onClick={next} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition">Next</button></Card>));
const OnboardingStep2 = React.memo(({ data, onChange, next, prev }) => (<Card><h2 className="text-xl font-semibold mb-4 text-center">Your Metrics</h2><div className="flex gap-4"><OnboardingInput label="Height (ft)" name="heightFeet" type="number" value={data.heightFeet} onChange={onChange} placeholder="5"/><OnboardingInput label="Height (in)" name="heightInches" type="number" value={data.heightInches} onChange={onChange} placeholder="10"/></div><OnboardingInput label="Weight (lbs)" name="weightLbs" type="number" value={data.weightLbs} onChange={onChange} placeholder="180" /><div className="flex gap-4"><button onClick={prev} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition">Back</button><button onClick={next} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition">Next</button></div></Card>));
const OnboardingStep3 = React.memo(({ data, onChange, submit, prev }) => (<Card><h2 className="text-xl font-semibold mb-4 text-center">Your Goals</h2><OnboardingSelect label="Activity Level" name="activityLevel" value={data.activityLevel} onChange={onChange}><option value="sedentary">Sedentary</option><option value="lightly_active">Lightly Active</option><option value="moderately_active">Moderately Active</option><option value="very_active">Very Active</option><option value="extra_active">Extra Active</option></OnboardingSelect><OnboardingInput label="Body Fat Goal (%)" name="bfGoal" type="number" value={data.bfGoal} onChange={onChange} placeholder="15" /><div className="flex gap-4"><button onClick={prev} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition">Back</button><button onClick={submit} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition">Finish Setup</button></div></Card>));

function Dashboard({ user, profile, setProfile, dailyData }) {
    const [page, setPage] = useState('home');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [showWeightPrompt, setShowWeightPrompt] = useState(false);
    const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);
    const [showPhotoAnalyzer, setShowPhotoAnalyzer] = useState(false);
    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);
        const todayData = dailyData[today];
        if (!todayData || typeof todayData.weightLbs === 'undefined') setShowWeightPrompt(true); else setShowWeightPrompt(false);
        const lastUpload = profile.lastPhotoUploadDate;
        if (!lastUpload) { setShowPhotoPrompt(true); } else {
            const diffDays = Math.ceil(Math.abs(new Date() - new Date(lastUpload)) / (1000 * 60 * 60 * 24));
            if (diffDays >= 7) setShowPhotoPrompt(true);
        }
    }, [dailyData, profile.lastPhotoUploadDate]);
    const handleDateChange = useCallback((e) => setSelectedDate(e.target.value), []);
    const todayEntry = useMemo(() => dailyData[selectedDate], [dailyData, selectedDate]);
    const isWorkoutDay = useMemo(() => todayEntry?.isWorkoutDay ?? true, [todayEntry]);
    const goals = isWorkoutDay ? profile.goals.workout : profile.goals.rest;
    const consumed = useMemo(() => {
        if (!todayEntry || !todayEntry.foods) return { protein: 0, carbs: 0, fat: 0, calories: 0 };
        return todayEntry.foods.reduce((acc, food) => ({ protein: acc.protein + (food.protein || 0), carbs: acc.carbs + (food.carbs || 0), fat: acc.fat + (food.fat || 0), calories: acc.calories + (food.calories || 0) }), { protein: 0, carbs: 0, fat: 0, calories: 0 });
    }, [todayEntry]);
    const renderPage = () => { switch (page) { case 'home': return <HomeScreen profile={profile} todayEntry={todayEntry} goals={goals} consumed={consumed} onDateChange={handleDateChange} selectedDate={selectedDate} user={user} isWorkoutDay={isWorkoutDay} />; case 'log': return <DailyLogScreen selectedDate={selectedDate} todayEntry={todayEntry} user={user} />; case 'workout': return <WorkoutScreen user={user} profile={profile} selectedDate={selectedDate} onDateChange={handleDateChange} todayEntry={todayEntry} />; case 'charts': return <ChartsScreen dailyData={dailyData} />; case 'profile': return <ProfileScreen user={user} profile={profile} setProfile={setProfile} />; default: return <HomeScreen profile={profile} todayEntry={todayEntry} goals={goals} consumed={consumed} onDateChange={handleDateChange} selectedDate={selectedDate} user={user} isWorkoutDay={isWorkoutDay} />; } };
    return (<div className="flex flex-col min-h-screen bg-gray-900 pb-20">{showWeightPrompt && <DailyWeightPrompt user={user} date={new Date().toISOString().slice(0, 10)} onClose={() => setShowWeightPrompt(false)} />}{showPhotoPrompt && <WeeklyPhotoPrompt onClose={() => setShowPhotoPrompt(false)} onUpload={() => { setShowPhotoPrompt(false); setShowPhotoAnalyzer(true); }} />}{showPhotoAnalyzer && <ProgressPhotoAnalyzer user={user} profile={profile} setProfile={setProfile} onClose={() => setShowPhotoAnalyzer(false)} />}<div className="flex-grow p-4">{renderPage()}</div><NavBar activePage={page} setPage={setPage} /></div>);
}

const HomeScreen = React.memo(({ profile, todayEntry, goals, consumed, onDateChange, selectedDate, user, isWorkoutDay }) => {
    const [weight, setWeight] = useState(todayEntry?.weightLbs || profile.weightLbs);
    const [showMealIdea, setShowMealIdea] = useState(false);
    
    useEffect(() => { setWeight(todayEntry?.weightLbs || profile.weightLbs); }, [todayEntry, profile.weightLbs]);
    const handleWeightChange = useCallback(async (e) => { const newWeight = e.target.value; setWeight(newWeight); if (newWeight && newWeight > 0) { const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${selectedDate}`); await setDoc(entryRef, { weightLbs: parseFloat(newWeight) }, { merge: true }); } }, [user, selectedDate]);
    const handleDayTypeToggle = useCallback(async () => { const newIsWorkoutDay = !isWorkoutDay; const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${selectedDate}`); await setDoc(entryRef, { isWorkoutDay: newIsWorkoutDay }, { merge: true }); }, [isWorkoutDay, user, selectedDate]);
    
    const remaining = useMemo(() => ({
        calories: goals.calories - consumed.calories,
        protein: goals.protein - consumed.protein,
        carbs: goals.carbs - consumed.carbs,
        fat: goals.fat - consumed.fat,
    }), [goals, consumed]);

    return (
        <div>
            {showMealIdea && <MealIdeaGenerator remainingMacros={remaining} onClose={() => setShowMealIdea(false)} />}
            <header className="mb-6"><h1 className="text-3xl font-bold text-white">Hello, {profile.name}</h1><p className="text-gray-400">Here's your summary for the day.</p></header>
            <Card><div className="flex justify-between items-center mb-4"><label htmlFor="date-picker" className="text-lg font-semibold">Date</label><input id="date-picker" type="date" value={selectedDate} onChange={onDateChange} className="bg-gray-700 text-white rounded-lg p-2 border-none"/></div><div className="flex justify-between items-center"><label htmlFor="weight-input" className="text-lg font-semibold">Weight (lbs)</label><input id="weight-input" type="number" value={weight} onChange={handleWeightChange} className="bg-gray-700 text-white rounded-lg p-2 w-24 text-right border-none" /></div><div className="flex justify-between items-center mt-4"><span className="text-lg font-semibold">Day Type</span><button onClick={handleDayTypeToggle} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition">{isWorkoutDay ? <Sun className="text-yellow-400"/> : <Moon className="text-blue-300" />}<span>{isWorkoutDay ? 'Workout' : 'Rest'}</span></button></div></Card>
            <Card>
                <div className="text-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-400">{remaining.calories >= 0 ? 'Calories Remaining' : 'Calories Over'}</h2>
                    <p className={`text-5xl font-bold ${remaining.calories >= 0 ? 'text-green-400' : 'text-red-500'}`}>{Math.round(Math.abs(remaining.calories))}</p>
                    <p className="text-gray-500">Goal: {goals.calories}</p>
                </div>
                 <button onClick={() => setShowMealIdea(true)} className="w-full text-center bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 mb-4">
                    <Sparkles size={18} /> Get Meal Idea
                </button>
                <div className="grid grid-cols-3 gap-4 text-center"><MacroCircle label="Protein" consumed={consumed.protein} goal={goals.protein} color="text-sky-400" /><MacroCircle label="Carbs" consumed={consumed.carbs} goal={goals.carbs} color="text-orange-400" /><MacroCircle label="Fat" consumed={consumed.fat} goal={goals.fat} color="text-pink-400" /></div>
            </Card>
            <RecentFoods foods={todayEntry?.foods || []} />
        </div>
    );
});

const MacroCircle = React.memo(({ label, consumed, goal, color }) => { const percentage = goal > 0 ? (consumed / goal) * 100 : 0; return (<div><div className="relative"><div className="w-full bg-gray-700 rounded-full h-2.5"><div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full" style={{ width: `${Math.min(percentage, 100)}%` }}></div></div></div><h3 className={`mt-2 font-semibold ${color}`}>{label}</h3><p className="text-sm text-gray-300">{Math.round(consumed)}g / {goal}g</p></div>); });
const RecentFoods = React.memo(({ foods }) => { if (!foods || foods.length === 0) { return (<Card><h2 className="text-xl font-semibold mb-2">Today's Log</h2><p className="text-gray-500 text-center py-4">No foods logged yet. Tap the 'Log' button to start!</p></Card>); } return (<Card><h2 className="text-xl font-semibold mb-4">Today's Log</h2><div className="space-y-3 max-h-48 overflow-y-auto pr-2">{foods.slice().reverse().map((food, index) => (<div key={index} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg"><p className="font-medium capitalize">{food.name}</p><p className="text-sm text-gray-400">{Math.round(food.calories)} kcal</p></div>))}</div></Card>); });

const DailyLogScreen = React.memo(({ selectedDate, todayEntry, user }) => { 
    const [showAiLogger, setShowAiLogger] = useState(false); 
    const addFood = useCallback(async (food) => { const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${selectedDate}`); const currentFoods = todayEntry?.foods || []; await setDoc(entryRef, { foods: [...currentFoods, food], date: new Date(selectedDate) }, { merge: true }); }, [user, selectedDate, todayEntry]); 
    const deleteFood = useCallback(async (indexToDelete) => { const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${selectedDate}`); const currentFoods = todayEntry?.foods || []; const updatedFoods = currentFoods.filter((_, index) => index !== indexToDelete); await setDoc(entryRef, { foods: updatedFoods }, { merge: true }); }, [user, selectedDate, todayEntry]); 
    return (<div className="h-full"><h1 className="text-3xl font-bold mb-4">Food Log for {selectedDate}</h1><button onClick={() => setShowAiLogger(true)} className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition mb-6"><Plus /> Add Food with AI</button><div className="space-y-4">{todayEntry?.foods && todayEntry.foods.map((food, index) => (<Card key={index} className="flex items-center justify-between"><div><p className="font-bold text-lg capitalize">{food.name}</p><div className="flex gap-4 text-sm text-gray-400 mt-1"><span>P: {food.protein}g</span><span>C: {food.carbs}g</span><span>F: {food.fat}g</span><span className="font-semibold text-gray-200">{Math.round(food.calories)} kcal</span></div></div><button onClick={() => deleteFood(index)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-gray-700 rounded-full transition"><XIcon size={18}/></button></Card>))}{(!todayEntry || !todayEntry.foods || todayEntry.foods.length === 0) && (<p className="text-center text-gray-500 mt-8">No food logged for this day.</p>)}</div>{showAiLogger && <AiFoodLogger onClose={() => setShowAiLogger(false)} onAddFood={addFood} />}</div>); 
});

const DailyWeightPrompt = React.memo(({ user, date, onClose }) => { const [weight, setWeight] = useState(''); const handleSave = useCallback(async () => { if (weight && weight > 0) { const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${date}`); await setDoc(entryRef, { weightLbs: parseFloat(weight), date: new Date(date) }, { merge: true }); onClose(); } }, [user, date, weight, onClose]); return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm text-center"><h2 className="text-2xl font-bold mb-2">Good Morning!</h2><p className="text-gray-400 mb-4">Let's log your weight for today.</p><input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Enter weight in lbs" className="w-full bg-gray-700 text-white rounded-lg p-3 text-center text-lg mb-4" /><button onClick={handleSave} disabled={!weight} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:bg-gray-600">Save Weight</button></div></div>); });
const WeeklyPhotoPrompt = React.memo(({ onClose, onUpload }) => { return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm text-center"><div className="flex justify-center mb-4"><div className="p-3 bg-indigo-500/20 rounded-full"><Camera className="w-8 h-8 text-indigo-400" /></div></div><h2 className="text-2xl font-bold mb-2">Weekly Check-in</h2><p className="text-gray-400 mb-6">It's time for your weekly progress photo. Let's update your macros with AI!</p><div className="flex flex-col gap-3"><button onClick={onUpload} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition">Upload Photo</button><button onClick={onClose} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition">Remind Me Later</button></div></div></div>); });
function AiFoodLogger({ onClose, onAddFood }) { const [mode, setMode] = useState('text'); const [inputText, setInputText] = useState(''); const [imageFile, setImageFile] = useState(null); const [previewUrl, setPreviewUrl] = useState(null); const [isLoading, setIsLoading] = useState(false); const [error, setError] = useState(null); const handleImageChange = (e) => { const file = e.target.files[0]; if (file) { setImageFile(file); setPreviewUrl(URL.createObjectURL(file)); } }; const fileToGenerativePart = async (file) => { const base64EncodedDataPromise = new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); }); return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type }, }; }; const callGeminiApi = async () => { setIsLoading(true); setError(null); const systemPrompt = "You are a nutritional expert. Analyze the provided meal. Provide a reasonable estimate of its macronutrients (protein, carbohydrates, fat in grams) and total calories. Respond ONLY with the data in the specified JSON schema. Be concise with the name."; const schema = { type: "OBJECT", properties: { "name": { "type": "STRING" }, "protein": { "type": "NUMBER" }, "carbs": { "type": "NUMBER" }, "fat": { "type": "NUMBER" }, "calories": { "type": "NUMBER" }, }, required: ["name", "protein", "carbs", "fat", "calories"] }; let parts; if (mode === 'image' && imageFile) { const imagePart = await fileToGenerativePart(imageFile); parts = [{ text: "Analyze the food in this image:"}, imagePart]; } else if (mode === 'text' && inputText) { parts = [{ text: `Analyze this meal: ${inputText}` }]; } else { setError("Please provide input."); setIsLoading(false); return; } try { const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: schema, } }) }); if (!response.ok) { throw new Error(`API error: ${response.statusText}`); } const result = await response.json(); const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text; if (jsonText) { const parsedData = JSON.parse(jsonText); onAddFood(parsedData); onClose(); } else { throw new Error("Invalid response structure from API."); } } catch (err) { console.error(err); setError(err.message || "Failed to analyze food. Please try again."); } finally { setIsLoading(false); } }; return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XIcon /></button><h2 className="text-2xl font-bold mb-4">Log Food with AI</h2><div className="flex bg-gray-700 rounded-lg p-1 mb-4"><button onClick={() => setMode('text')} className={`w-1/2 py-2 rounded-md transition ${mode === 'text' ? 'bg-indigo-600' : ''}`}>Text</button><button onClick={() => setMode('image')} className={`w-1/2 py-2 rounded-md transition ${mode === 'image' ? 'bg-indigo-600' : ''}`}>Image</button></div>{mode === 'text' ? (<div className="relative"><textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="e.g., A bowl of oatmeal with blueberries and almonds" className="w-full bg-gray-900 border-gray-700 text-white rounded-lg p-3 h-28 resize-none focus:ring-2 focus:ring-indigo-500" /><button onClick={callGeminiApi} disabled={isLoading || !inputText} className="absolute bottom-3 right-3 bg-indigo-600 p-2 rounded-full disabled:bg-gray-500">{isLoading ? <Loader2 className="animate-spin" /> : <Send />}</button></div>) : (<div><label htmlFor="image-upload" className="w-full h-40 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-gray-700 transition">{previewUrl ? (<img src={previewUrl} alt="Preview" className="w-full h-full object-cover rounded-lg" />) : (<><ImageIcon className="w-10 h-10 text-gray-500 mb-2" /><p className="text-gray-400">Tap to upload a photo</p></>)}</label><input id="image-upload" type="file" accept="image/*" className="hidden" onChange={handleImageChange} /><button onClick={callGeminiApi} disabled={isLoading || !imageFile} className="mt-4 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:bg-gray-500">{isLoading ? <Loader2 className="animate-spin" /> : 'Analyze Food'}</button></div>)}{error && <p className="text-red-500 text-sm mt-2">{error}</p>}</div></div>); }

const ChartsScreen = React.memo(({ dailyData }) => {
    const [showWeeklySummary, setShowWeeklySummary] = useState(false);
    const chartData = useMemo(() => {
        return Object.keys(dailyData).sort().map(date => {
            const entry = dailyData[date];
            const consumed = entry.foods?.reduce((acc, food) => ({ protein: acc.protein + (food.protein || 0), carbs: acc.carbs + (food.carbs || 0), fat: acc.fat + (food.fat || 0), calories: acc.calories + (food.calories || 0) }), { protein: 0, carbs: 0, fat: 0, calories: 0 }) || { protein: 0, carbs: 0, fat: 0, calories: 0 }; return { date, weight: entry.weightLbs, ...consumed };
        });
    }, [dailyData]);
    if (chartData.length < 2) return <div className="text-center p-8 text-gray-400">Log data for at least two days to see your progress charts.</div>;
    return (
        <div>
            {showWeeklySummary && <WeeklySummaryGenerator weeklyData={chartData.slice(-7)} onClose={() => setShowWeeklySummary(false)} />}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Your Progress</h1>
                <button onClick={() => setShowWeeklySummary(true)} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition">
                    <Sparkles size={16} /> Summarize My Week
                </button>
            </div>
            <Card><h2 className="text-xl font-semibold mb-4">Weight Trend (lbs)</h2><ResponsiveContainer width="100%" height={250}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#4A5568" /><XAxis dataKey="date" tick={{ fill: '#A0AEC0' }} /><YAxis tick={{ fill: '#A0AEC0' }} domain={['dataMin - 5', 'dataMax + 5']} /><Tooltip contentStyle={{ backgroundColor: '#1A202C', border: 'none' }} /><Legend /><Line type="monotone" dataKey="weight" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }}/></LineChart></ResponsiveContainer></Card>
            <Card><h2 className="text-xl font-semibold mb-4">Calorie Intake</h2><ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#4A5568" /><XAxis dataKey="date" tick={{ fill: '#A0AEC0' }} /><YAxis tick={{ fill: '#A0AEC0' }}/><Tooltip contentStyle={{ backgroundColor: '#1A202C', border: 'none' }} /><Legend /><Bar dataKey="calories" fill="#38b2ac" /></BarChart></ResponsiveContainer></Card>
        </div>
    );
});

const WorkoutScreen = React.memo(({ user, profile, selectedDate, onDateChange, todayEntry }) => {
    const [workoutPlan, setWorkoutPlan] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [newSetData, setNewSetData] = useState({});
    const [substituteModal, setSubstituteModal] = useState({ open: false, exerciseName: '', dayIndex: -1, exerciseIndex: -1 });
    const [substitutions, setSubstitutions] = useState([]);
    const [isSubstituting, setIsSubstituting] = useState(false);

    const workoutLog = useMemo(() => todayEntry?.workoutLog || {}, [todayEntry]);

    const handleNewSetChange = useCallback((exerciseName, field, value) => {
        setNewSetData(prev => ({ ...prev, [exerciseName]: { ...(prev[exerciseName] || { reps: '', weight: '' }), [field]: value } }));
    }, []);

    const handleAddSet = useCallback(async (exerciseName) => {
        const currentSet = newSetData[exerciseName];
        if (!currentSet || !currentSet.reps || !currentSet.weight) return;
        const newSet = { reps: parseInt(currentSet.reps, 10), weight: parseFloat(currentSet.weight) };
        const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${selectedDate}`);
        const updatedLog = { ...workoutLog, [exerciseName]: [...(workoutLog[exerciseName] || []), newSet] };
        await setDoc(entryRef, { workoutLog: updatedLog, date: new Date(selectedDate) }, { merge: true });
        setNewSetData(prev => ({ ...prev, [exerciseName]: { reps: '', weight: '' } }));
    }, [newSetData, workoutLog, user, selectedDate]);

    const handleDeleteSet = useCallback(async (exerciseName, setIndex) => {
        const entryRef = doc(db, `artifacts/${appId}/users/${user.uid}/dailyEntries/${selectedDate}`);
        const updatedSets = (workoutLog[exerciseName] || []).filter((_, index) => index !== setIndex);
        const updatedLog = { ...workoutLog, [exerciseName]: updatedSets };
        await setDoc(entryRef, { workoutLog: updatedLog }, { merge: true });
    }, [workoutLog, user, selectedDate]);

    const openSubstituteModal = useCallback(async (exerciseName, dayIndex, exerciseIndex) => {
        setSubstituteModal({ open: true, exerciseName, dayIndex, exerciseIndex });
        setIsSubstituting(true);
        setSubstitutions([]);
        const systemPrompt = `You are an expert personal trainer. The user wants to substitute the exercise '${exerciseName}'. Provide a list of 5 alternative exercises that target the same primary muscle group. Respond ONLY with a JSON array of strings, where each string is an exercise name.`;
        const schema = { type: "ARRAY", items: { type: "STRING" } };
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Substitutes for ${exerciseName}` }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: schema } })
            });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) throw new Error("Invalid response from AI.");
            setSubstitutions(JSON.parse(jsonText));
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubstituting(false);
        }
    }, []);

    const handleSelectSubstitution = useCallback((newExerciseName) => {
        const { dayIndex, exerciseIndex } = substituteModal;
        const newPlan = JSON.parse(JSON.stringify(workoutPlan));
        newPlan.days[dayIndex].exercises[exerciseIndex].name = newExerciseName;
        setWorkoutPlan(newPlan);
        setSubstituteModal({ open: false, exerciseName: '', dayIndex: -1, exerciseIndex: -1 });
    }, [substituteModal, workoutPlan]);

    const generatePlan = useCallback(async () => {
        setIsLoading(true); setError(null); setWorkoutPlan(null);
        const systemPrompt = `You are an expert personal trainer. Based on the user's profile: Age: ${profile.age}, Gender: ${profile.gender}, Weight: ${profile.weightLbs} lbs, Goal: reach ${profile.bfGoal}% body fat, Activity Level: ${profile.activityLevel.replace('_', ' ')}. Create a balanced 4-day weekly workout plan. Include a mix of compound and isolation exercises for each day, specifying the recommended sets and reps (e.g., "3 sets of 8-12 reps"). Provide a title for the plan and a brief weekly summary. Structure the response using the specified JSON schema.`;
        const schema = { type: "OBJECT", properties: { planTitle: { type: "STRING" }, weeklySummary: { type: "STRING" }, days: { type: "ARRAY", items: { type: "OBJECT", properties: { day: { type: "STRING" }, focus: { type: "STRING" }, exercises: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, sets: { type: "STRING" }, reps: { type: "STRING" } }, required: ["name", "sets", "reps"] } } }, required: ["day", "focus", "exercises"] } } }, required: ["planTitle", "weeklySummary", "days"] };
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: "Generate a workout plan for me." }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: schema } }) });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) throw new Error("Invalid response from AI.");
            setWorkoutPlan(JSON.parse(jsonText));
        } catch (err) { setError(err.message || "Failed to generate workout plan."); } finally { setIsLoading(false); }
    }, [profile]);

    return (
        <div>
            {substituteModal.open && <SubstitutionModal onClose={() => setSubstituteModal({ open: false, exerciseName: '', dayIndex: -1, exerciseIndex: -1 })} exerciseName={substituteModal.exerciseName} isLoading={isSubstituting} substitutions={substitutions} onSelect={handleSelectSubstitution} />}
            <h1 className="text-3xl font-bold mb-2">AI Workout Planner</h1>
            <p className="text-gray-400 mb-6">Log your workout for the selected day.</p>
            <Card><div className="flex justify-between items-center"><label htmlFor="workout-date-picker" className="text-lg font-semibold">Workout Date</label><input id="workout-date-picker" type="date" value={selectedDate} onChange={onDateChange} className="bg-gray-700 text-white rounded-lg p-2 border-none"/></div></Card>

            {!workoutPlan && !isLoading && (
                 <Card className="text-center"><Dumbbell size={48} className="mx-auto text-indigo-400 mb-4" /><h2 className="text-xl font-semibold mb-2">Ready for a new routine?</h2><p className="text-gray-400 mb-6">Let our AI generate a personalized weekly workout plan based on your profile and goals.</p><button onClick={generatePlan} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"><Sparkles size={18} /> Generate My Plan</button></Card>
            )}
            {isLoading && (<div className="text-center p-8"><Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto" /><p className="mt-4 text-gray-400">Generating your personalized plan...</p></div>)}
            {error && <p className="text-red-500 text-center">{error}</p>}
            {workoutPlan && (
                <div>
                     <Card><h2 className="text-2xl font-bold text-indigo-300 mb-2">{workoutPlan.planTitle}</h2><p className="text-gray-400 mb-4">{workoutPlan.weeklySummary}</p><button onClick={generatePlan} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"><Sparkles size={16} /> Regenerate Plan</button></Card>
                    {workoutPlan.days.map((day, dayIndex) => (
                        <Card key={dayIndex}><h3 className="text-xl font-semibold mb-1">{day.day}</h3><p className="text-indigo-400 font-medium mb-4">{day.focus}</p><div className="space-y-4">
                            {day.exercises.map((ex, exIndex) => (
                                <div key={exIndex} className="bg-gray-900/50 p-4 rounded-lg"><div className="flex justify-between items-start mb-3"><div className="flex-1"><p className="font-bold text-lg">{ex.name}</p><p className="text-sm text-gray-400">{ex.sets} of {ex.reps}</p></div><button onClick={() => openSubstituteModal(ex.name, dayIndex, exIndex)} className="text-gray-400 hover:text-indigo-400 p-2"><Replace size={18} /></button></div><div className="space-y-2 mb-3">
                                    {(workoutLog[ex.name] || []).map((set, setIndex) => (<div key={setIndex} className="flex items-center justify-between bg-gray-700 p-2 rounded-md text-sm"><span className="font-mono text-gray-400">Set {setIndex + 1}</span><span>{set.reps} reps</span><span>@ {set.weight} lbs</span><button onClick={() => handleDeleteSet(ex.name, setIndex)} className="text-gray-500 hover:text-red-400 p-1"><XIcon size={16} /></button></div>))}
                                    {(workoutLog[ex.name] || []).length === 0 && <p className="text-xs text-center text-gray-500 py-1">No sets logged yet.</p>}
                                </div><div className="flex items-center gap-2"><input type="number" placeholder="Reps" value={newSetData[ex.name]?.reps || ''} onChange={(e) => handleNewSetChange(ex.name, 'reps', e.target.value)} className="w-full bg-gray-700 rounded p-2 text-center border border-transparent focus:border-indigo-500 focus:ring-indigo-500" /><span className="text-gray-500 font-bold">X</span><input type="number" placeholder="Lbs" value={newSetData[ex.name]?.weight || ''} onChange={(e) => handleNewSetChange(ex.name, 'weight', e.target.value)} className="w-full bg-gray-700 rounded p-2 text-center border border-transparent focus:border-indigo-500 focus:ring-indigo-500" /><button onClick={() => handleAddSet(ex.name)} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg"><Plus size={20} /></button></div></div>
                            ))}
                        </div></Card>
                    ))}
                </div>
            )}
        </div>
    );
});

const ProfileScreen = React.memo(({ user, profile, setProfile }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState(profile);
    const [showCalcDetails, setShowCalcDetails] = useState(false);
    const [showPhotoAnalyzer, setShowPhotoAnalyzer] = useState(false);
    const [progressPhotos, setProgressPhotos] = useState([]);

    useEffect(() => {
        if (!user) return;
        const photosQuery = query(collection(db, `artifacts/${appId}/users/${user.uid}/progressPhotos`));
        const unsubscribe = onSnapshot(photosQuery, (snapshot) => {
            const photos = [];
            snapshot.forEach(doc => photos.push(doc.data()));
            // Sort photos by date descending
            photos.sort((a,b) => new Date(b.date) - new Date(a.date));
            setProgressPhotos(photos);
        });
        return () => unsubscribe();
    }, [user]);
    
    const handleChange = useCallback((e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value })), []);
    const handleSave = useCallback(async () => {
        const calculationResult = calculateMacros(formData);
        const newGoals = { workout: calculationResult.workout, rest: calculationResult.rest };
        const updatedProfile = { ...formData, goals: newGoals };
        const profileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/main`);
        await setDoc(profileRef, updatedProfile, { merge: true });
        setProfile(updatedProfile);
        setIsEditing(false);
    }, [formData, user, setProfile]);

    return (
        <div>
            {showCalcDetails && <CalculationDetailsModal profile={profile} onClose={() => setShowCalcDetails(false)} />}
            {showPhotoAnalyzer && <ProgressPhotoAnalyzer user={user} profile={profile} setProfile={setProfile} onClose={() => setShowPhotoAnalyzer(false)} />}
            <h1 className="text-3xl font-bold mb-6">Profile & Settings</h1>
            <Card><div className="flex justify-between items-center"><h2 className="text-xl font-semibold">Weekly Check-in</h2><button onClick={() => setShowPhotoAnalyzer(true)} className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-2"><Camera size={18} /> Upload Photo</button></div><p className="text-sm text-gray-400 mt-2">Last upload: {profile.lastPhotoUploadDate ? new Date(profile.lastPhotoUploadDate).toLocaleDateString() : 'Never'}</p></Card>
            <ProgressGallery photos={progressPhotos} />
            <Card><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-semibold">Your Details</h2><button onClick={() => setIsEditing(!isEditing)} className="text-indigo-400 hover:text-indigo-300">{isEditing ? 'Cancel' : 'Edit'}</button></div>{isEditing ? (<div className="space-y-4"><OnboardingInput label="Name" name="name" value={formData.name} onChange={handleChange} /><OnboardingInput label="Age" name="age" type="number" value={formData.age} onChange={handleChange} /><OnboardingInput label="Weight (lbs)" name="weightLbs" type="number" value={formData.weightLbs} onChange={handleChange} /><OnboardingInput label="Body Fat Goal (%)" name="bfGoal" type="number" value={formData.bfGoal} onChange={handleChange} /><OnboardingSelect label="Activity Level" name="activityLevel" value={formData.activityLevel} onChange={handleChange}><option value="sedentary">Sedentary</option><option value="lightly_active">Lightly Active</option><option value="moderately_active">Moderately Active</option><option value="very_active">Very Active</option><option value="extra_active">Extra Active</option></OnboardingSelect><button onClick={handleSave} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition">Save Changes</button></div>) : (<div className="space-y-2 text-lg"><p><span className="font-semibold text-gray-400">Name: </span>{profile.name}</p><p><span className="font-semibold text-gray-400">Age: </span>{profile.age}</p><p><span className="font-semibold text-gray-400">Gender: </span><span className="capitalize">{profile.gender}</span></p><p><span className="font-semibold text-gray-400">Weight: </span>{profile.weightLbs} lbs</p><p><span className="font-semibold text-gray-400">Activity: </span><span className="capitalize">{profile.activityLevel.replace('_', ' ')}</span></p><p><span className="font-semibold text-gray-400">Body Fat Goal: </span>{profile.bfGoal}%</p></div>)}</Card>
            <Card><div className="flex justify-between items-center"><h2 className="text-xl font-semibold">Macro Goals</h2><button onClick={() => setShowCalcDetails(true)} className="text-indigo-400 hover:text-indigo-300 font-semibold">View Calculation</button></div></Card>
            <Card><h2 className="text-xl font-semibold mb-2">User ID</h2><p className="text-gray-500 text-sm break-all">{user.uid}</p></Card>
        </div>
    );
});

function ProgressPhotoAnalyzer({ user, profile, setProfile, onClose }) { const [imageFile, setImageFile] = useState(null); const [previewUrl, setPreviewUrl] = useState(null); const [isLoading, setIsLoading] = useState(false); const [error, setError] = useState(null); const [analysisResult, setAnalysisResult] = useState(null); const handleImageChange = (e) => { const file = e.target.files[0]; if (file) { setImageFile(file); setPreviewUrl(URL.createObjectURL(file)); } }; const fileToGenerativePart = async (file) => { const base64EncodedDataPromise = new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); }); return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } }; }; const handleAnalysis = async () => { if (!imageFile) { setError("Please upload an image first."); return; } setIsLoading(true); setError(null); const systemPrompt = `You are an elite fitness and nutrition coach. Analyze the user's physique in the photo. Their goal is ${profile.bfGoal}% body fat. Current weight is ${profile.weightLbs} lbs. Provide updated daily macronutrient targets (protein, carbs, fat, calories for a workout day) to help them achieve their goal. Also provide a brief, encouraging 'reasoning'. Respond ONLY with the specified JSON schema.`; const schema = { type: "OBJECT", properties: { protein: { type: "NUMBER" }, carbs: { type: "NUMBER" }, fat: { type: "NUMBER" }, calories: { type: "NUMBER" }, reasoning: { type: "STRING" }, }, required: ["protein", "carbs", "fat", "calories", "reasoning"], }; try { const imagePart = await fileToGenerativePart(imageFile); const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: "Analyze my progress." }, imagePart] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: schema }, }), }); if (!response.ok) throw new Error(`API error: ${response.statusText}`); const result = await response.json(); const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text; if (!jsonText) throw new Error("Invalid response from AI."); const storageRef = ref(storage, `artifacts/${appId}/users/${user.uid}/progress_photos/${new Date().toISOString()}_${imageFile.name}`); const snapshot = await uploadBytes(storageRef, imageFile); const downloadURL = await getDownloadURL(snapshot.ref); const photoDocRef = doc(collection(db, `artifacts/${appId}/users/${user.uid}/progressPhotos`)); await setDoc(photoDocRef, { url: downloadURL, date: new Date().toISOString() }); setAnalysisResult(JSON.parse(jsonText)); } catch (err) { setError(err.message || "Failed to analyze photo."); } finally { setIsLoading(false); } }; const handleAcceptChanges = async () => { if (!analysisResult) return; const newWorkoutGoals = { calories: analysisResult.calories, protein: analysisResult.protein, carbs: analysisResult.carbs, fat: analysisResult.fat }; const newRestGoals = { ...newWorkoutGoals, carbs: Math.round(newWorkoutGoals.carbs * 0.8), calories: Math.round(newWorkoutGoals.calories * 0.9) }; const updatedProfile = { ...profile, goals: { workout: newWorkoutGoals, rest: newRestGoals, }, lastPhotoUploadDate: new Date().toISOString(), }; const profileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/main`); await setDoc(profileRef, updatedProfile, { merge: true }); setProfile(updatedProfile); onClose(); }; return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XIcon /></button><h2 className="text-2xl font-bold mb-4 text-center">AI Progress Analysis</h2>{analysisResult ? (<div><div className="p-4 bg-gray-900 rounded-lg mb-4"><h3 className="font-semibold text-lg mb-2 text-indigo-400 flex items-center gap-2"><Sparkles size={20}/> AI Recommendation</h3><p className="text-gray-300 text-sm">{analysisResult.reasoning}</p></div><div className="grid grid-cols-2 gap-4 mb-6"><div className="bg-gray-700 p-3 rounded-lg text-center"><span className="block text-xs text-gray-400">Calories</span><span className="text-xl font-bold">{analysisResult.calories}</span></div><div className="bg-gray-700 p-3 rounded-lg text-center"><span className="block text-xs text-gray-400">Protein</span><span className="text-xl font-bold">{analysisResult.protein}g</span></div><div className="bg-gray-700 p-3 rounded-lg text-center"><span className="block text-xs text-gray-400">Carbs</span><span className="text-xl font-bold">{analysisResult.carbs}g</span></div><div className="bg-gray-700 p-3 rounded-lg text-center"><span className="block text-xs text-gray-400">Fat</span><span className="text-xl font-bold">{analysisResult.fat}g</span></div></div><button onClick={handleAcceptChanges} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition">Accept & Update Goals</button></div>) : (<div><label htmlFor="progress-photo-upload" className="w-full h-48 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-gray-700 transition mb-4">{previewUrl ? (<img src={previewUrl} alt="Progress" className="w-full h-full object-cover rounded-lg" />) : (<><ImageIcon className="w-10 h-10 text-gray-500 mb-2" /><p className="text-gray-400">Tap to upload a photo</p><p className="text-xs text-gray-500">For best results, use good lighting.</p></>)}</label><input id="progress-photo-upload" type="file" accept="image/*" className="hidden" onChange={handleImageChange} /><button onClick={handleAnalysis} disabled={isLoading || !imageFile} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:bg-gray-500">{isLoading ? <Loader2 className="animate-spin" /> : <><Sparkles size={18}/> Analyze My Progress</>}</button>{error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}</div>)}</div></div>); }
const CalculationDetailsModal = React.memo(({ profile, onClose }) => { const calc = calculateMacros(profile); const DetailRow = ({ label, value, unit='' }) => (<div className="flex justify-between items-center py-2 border-b border-gray-700"><span className="text-gray-400">{label}</span><span className="font-semibold">{value} {unit}</span></div>); return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XIcon /></button><h2 className="text-2xl font-bold mb-4 text-center">Macro Calculation</h2><Card className="!p-4 !mb-4"><h3 className="font-semibold text-lg mb-2 text-indigo-400">Basal Metabolic Rate (BMR)</h3><DetailRow label="Your BMR is" value={calc.bmr} unit="calories/day" /><p className="text-xs text-gray-500 mt-2">The calories your body burns at rest.</p></Card><Card className="!p-4 !mb-4"><h3 className="font-semibold text-lg mb-2 text-indigo-400">Total Daily Energy Expenditure (TDEE)</h3><DetailRow label="Your TDEE is" value={calc.tdee} unit="calories/day" /><DetailRow label="Calorie Deficit (20%)" value={`-${calc.deficit}`} unit="calories" /><p className="text-xs text-gray-500 mt-2">Your BMR plus calories burned from activity.</p></Card><Card className="!p-4 !mb-4"><h3 className="font-semibold text-lg mb-2 text-indigo-400">Workout Day Goals</h3><DetailRow label="Calories" value={calc.workout.calories} unit="kcal" /><DetailRow label="Protein" value={calc.workout.protein} unit="g" /><DetailRow label="Carbs" value={calc.workout.carbs} unit="g" /><DetailRow label="Fat" value={calc.workout.fat} unit="g" /></Card></div></div>); });
const ProgressGallery = React.memo(({ photos }) => { if (photos.length === 0) return null; return (<Card><h2 className="text-xl font-semibold mb-4">Progress Gallery</h2><div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{photos.map(photo => (<div key={photo.url} className="relative aspect-square group"><img src={photo.url} alt={`Progress on ${new Date(photo.date).toLocaleDateString()}`} className="rounded-lg object-cover w-full h-full" /><div className="absolute inset-0 bg-black bg-opacity-50 flex items-end justify-center p-2 opacity-0 group-hover:opacity-100 transition-opacity"><p className="text-white text-xs font-semibold">{new Date(photo.date).toLocaleDateString()}</p></div></div>))}</div></Card>); });
const SubstitutionModal = React.memo(({ onClose, exerciseName, isLoading, substitutions, onSelect }) => (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XIcon /></button><h2 className="text-2xl font-bold mb-2">Substitute Exercise</h2><p className="text-gray-400 mb-4">Alternatives for <span className="font-semibold text-indigo-300">{exerciseName}</span>:</p>{isLoading ? <div className="text-center p-8"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" /></div> : <div className="space-y-2">{substitutions.map(sub => (<button key={sub} onClick={() => onSelect(sub)} className="w-full text-left bg-gray-700 hover:bg-indigo-600 p-3 rounded-lg transition">{sub}</button>))
        }{substitutions.length === 0 && <p className="text-gray-500 text-center">No alternatives found.</p>}</div>}</div></div>));

function MealIdeaGenerator({ remainingMacros, onClose }) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [idea, setIdea] = useState(null);

    useEffect(() => {
        const fetchMealIdea = async () => {
            setIsLoading(true);
            setError(null);
            const systemPrompt = `You are a helpful nutritionist. The user has the following macros remaining for the day: Protein: ${Math.round(remainingMacros.protein)}g, Carbs: ${Math.round(remainingMacros.carbs)}g, Fat: ${Math.round(remainingMacros.fat)}g, Calories: ${Math.round(remainingMacros.calories)}. Suggest a single, simple meal or snack that fits these macros. Provide a simple recipe (as a list of steps) and a brief reason why it's a good choice. Respond ONLY in the specified JSON format.`;
            const schema = { type: "OBJECT", properties: { mealName: { type: "STRING" }, recipe: { type: "STRING" }, reasoning: { type: "STRING" } }, required: ["mealName", "recipe", "reasoning"] };
            
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: "Give me a meal idea." }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: schema } }) });
                if (!response.ok) throw new Error(`API error: ${response.statusText}`);
                const result = await response.json();
                const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!jsonText) throw new Error("Invalid response from AI.");
                setIdea(JSON.parse(jsonText));
            } catch (err) { setError(err.message || "Failed to generate meal idea."); } finally { setIsLoading(false); }
        };
        fetchMealIdea();
    }, [remainingMacros]);

    return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XIcon /></button><div className="text-center"><div className="flex justify-center mb-4"><div className="p-3 bg-indigo-500/20 rounded-full"><Lightbulb className="w-8 h-8 text-indigo-400" /></div></div><h2 className="text-2xl font-bold mb-4">AI Meal Suggestion</h2>{isLoading && <div className="flex flex-col items-center"><Loader2 className="animate-spin w-10 h-10 text-indigo-400" /><p className="mt-2 text-gray-400">Generating idea...</p></div>}{error && <p className="text-red-400">{error}</p>}{idea && (<div className="text-left"><h3 className="text-xl font-semibold text-indigo-300 mb-2">{idea.mealName}</h3><p className="text-sm text-gray-400 mb-4 bg-gray-900 p-3 rounded-lg"><strong>Why it works:</strong> {idea.reasoning}</p><div><h4 className="font-semibold mb-2">Recipe:</h4><p className="text-gray-300 whitespace-pre-wrap text-sm">{idea.recipe}</p></div></div>)}</div></div></div>);
}

function WeeklySummaryGenerator({ weeklyData, onClose }) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState("");

    useEffect(() => {
        const fetchSummary = async () => {
            setIsLoading(true);
            setError(null);
            const simplifiedData = weeklyData.map(d => ({ date: d.date, weight: d.weight, calories: Math.round(d.calories) }));
            const systemPrompt = `You are a positive and motivating fitness coach. Here is the user's data for the last ${simplifiedData.length} days: ${JSON.stringify(simplifiedData)}. Analyze their consistency with calories and their weight trend. Provide a short (2-3 sentences), encouraging summary of their week and one simple, actionable tip for the week ahead. Address the user directly as "you".`;
            
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: "Summarize my week." }] }], systemInstruction: { parts: [{ text: systemPrompt }] } }) });
                if (!response.ok) throw new Error(`API error: ${response.statusText}`);
                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error("Invalid response from AI.");
                setSummary(text);
            } catch (err) { setError(err.message || "Failed to generate summary."); } finally { setIsLoading(false); }
        };
        if (weeklyData.length > 0) fetchSummary(); else { setIsLoading(false); setSummary("Not enough data to generate a summary.") }
    }, [weeklyData]);

    return (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md relative"><button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><XIcon /></button><div className="text-center"><div className="flex justify-center mb-4"><div className="p-3 bg-green-500/20 rounded-full"><ClipboardList className="w-8 h-8 text-green-400" /></div></div><h2 className="text-2xl font-bold mb-4">Your Weekly Summary</h2>{isLoading && <div className="flex flex-col items-center"><Loader2 className="animate-spin w-10 h-10 text-green-400" /><p className="mt-2 text-gray-400">Analyzing your week...</p></div>}{error && <p className="text-red-400">{error}</p>}{summary && <p className="text-gray-300 text-left whitespace-pre-wrap">{summary}</p>}</div></div></div>);
}

// --- UI Utilities ---
const NavBar = React.memo(({ activePage, setPage }) => { const navItems = [{ id: 'home', icon: <BarChart2 />, label: 'Dashboard' }, { id: 'log', icon: <BookOpen />, label: 'Log' }, { id: 'workout', icon: <Dumbbell />, label: 'Workout'}, { id: 'charts', icon: <LineChart />, label: 'Charts' }, { id: 'profile', icon: <User />, label: 'Profile' },]; return (<nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 max-w-lg mx-auto"><div className="flex justify-around items-center h-16">{navItems.map(item => (<button key={item.id} onClick={() => setPage(item.id)} className={`flex flex-col items-center justify-center w-full transition-colors duration-200 ${activePage === item.id ? 'text-indigo-400' : 'text-gray-500 hover:text-indigo-300'}`}>{React.cloneElement(item.icon, { size: 24, strokeWidth: activePage === item.id ? 2.5 : 2 })}<span className="text-xs mt-1">{item.label}</span></button>))}</div></nav>); });
const Card = React.memo(({ children, className = '' }) => (<div className={`bg-gray-800 rounded-2xl p-6 mb-6 shadow-lg ${className}`}>{children}</div>));

