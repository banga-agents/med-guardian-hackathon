/**
 * Patient Configuration & Data
 * Pre-configured simulated patients with realistic conditions
 */

import { PatientAgent, WearableDevice, PatientId } from '@/types/simulation';

export const PATIENTS: Record<PatientId, PatientAgent> = {
  self: {
    id: 'self',
    name: 'You',
    age: 33,
    condition: 'general_monitoring',
    avatar: '/avatars/self.png',
    bio: 'Phone-first personal profile for manual symptom journaling, chat-based check-ins, and persistent longitudinal history without connected devices.',
    profileType: 'personal',

    state: 'active',
    location: 'home',

    wearables: [],

    agentConfig: {
      personality: 'responsive',
      responseDelay: 500,
    },

    isConnected: true,
    lastActivity: Date.now(),
    currentActivity: 'Checking in from phone',
    nextActivity: 'Log symptoms if anything changes',
    nextActivityTime: Date.now() + 2 * 60 * 60 * 1000,
  },
  sarah: {
    id: 'sarah',
    name: 'Sarah Miller',
    age: 28,
    condition: 'diabetes',
    avatar: '/avatars/sarah.png',
    bio: 'Marketing professional working from home. Diagnosed with Type 1 Diabetes at age 12. Uses Dexcom G7 CGM and insulin pump. Active lifestyle but struggles with morning glucose spikes.',
    profileType: 'simulation',
    
    state: 'working',
    location: 'home',
    
    wearables: [
      {
        id: 'sarah-cgm',
        type: 'cgm',
        name: 'Dexcom G7',
        batteryLevel: 78,
        isConnected: true,
        lastSync: Date.now(),
        syncInterval: 5, // 5 minutes
      },
      {
        id: 'sarah-watch',
        type: 'smartwatch',
        name: 'Apple Watch Ultra',
        batteryLevel: 45,
        isConnected: true,
        lastSync: Date.now(),
        syncInterval: 5,
      },
      {
        id: 'sarah-bp',
        type: 'bp_monitor',
        name: 'Omron HeartGuide',
        batteryLevel: 92,
        isConnected: true,
        lastSync: Date.now() - 1800000, // 30 mins ago
        syncInterval: 30,
      },
    ],
    
    agentConfig: {
      personality: 'responsive',
      responseDelay: 800,
    },
    
    isConnected: true,
    lastActivity: Date.now(),
    currentActivity: 'Working on laptop',
    nextActivity: 'Lunch break',
    nextActivityTime: Date.now() + 3600000, // 1 hour
  },
  
  robert: {
    id: 'robert',
    name: 'Robert Chen',
    age: 54,
    condition: 'hypertension',
    avatar: '/avatars/robert.png',
    bio: 'Software engineering manager. Hypertension diagnosed 5 years ago. Also has sleep apnea. High-stress job, irregular sleep schedule. Trying to improve diet and exercise.',
    profileType: 'simulation',
    
    state: 'sleeping',
    location: 'sleeping',
    
    wearables: [
      {
        id: 'robert-ring',
        type: 'sleep_ring',
        name: 'Oura Ring Gen 3',
        batteryLevel: 65,
        isConnected: true,
        lastSync: Date.now(),
        syncInterval: 5,
      },
      {
        id: 'robert-bp',
        type: 'bp_monitor',
        name: 'Omron Evolv',
        batteryLevel: 88,
        isConnected: true,
        lastSync: Date.now() - 7200000, // 2 hours ago
        syncInterval: 60,
      },
      {
        id: 'robert-watch',
        type: 'smartwatch',
        name: 'Garmin Fenix 7',
        batteryLevel: 23,
        isConnected: true,
        lastSync: Date.now(),
        syncInterval: 5,
      },
    ],
    
    agentConfig: {
      personality: 'detailed',
      responseDelay: 1200,
    },
    
    isConnected: true,
    lastActivity: Date.now() - 28800000, // 8 hours ago
  },
  
  emma: {
    id: 'emma',
    name: 'Emma Thompson',
    age: 34,
    condition: 'long_covid',
    avatar: '/avatars/emma.png',
    bio: 'UX designer, working remotely. Developed Long COVID 18 months ago. Main symptoms: chronic fatigue, brain fog, occasional palpitations. Unpredictable symptom flares.',
    profileType: 'simulation',
    
    state: 'resting',
    location: 'home',
    
    wearables: [
      {
        id: 'emma-watch',
        type: 'smartwatch',
        name: 'Fitbit Sense 2',
        batteryLevel: 56,
        isConnected: true,
        lastSync: Date.now(),
        syncInterval: 15,
      },
      {
        id: 'emma-ox',
        type: 'pulse_ox',
        name: 'Wellue O2Ring',
        batteryLevel: 71,
        isConnected: true,
        lastSync: Date.now() - 3600000, // 1 hour ago
        syncInterval: 60,
      },
    ],
    
    agentConfig: {
      personality: 'proactive',
      responseDelay: 1500,
    },
    
    isConnected: true,
    lastActivity: Date.now() - 1800000, // 30 mins ago
    currentActivity: 'Resting on sofa',
    nextActivity: 'Gentle stretching',
    nextActivityTime: Date.now() + 1800000, // 30 mins
  },
  
  michael: {
    id: 'michael',
    name: 'Michael Anderson',
    age: 67,
    condition: 'arrhythmia',
    avatar: '/avatars/michael.png',
    bio: 'Retired teacher, lives alone. Atrial fibrillation diagnosed 3 years ago. On blood thinners and beta blockers. Very regular lifestyle, meticulous about medications.',
    profileType: 'simulation',
    
    state: 'active',
    location: 'home',
    
    wearables: [
      {
        id: 'michael-ecg',
        type: 'ecg',
        name: 'AliveCor KardiaMobile',
        batteryLevel: 95,
        isConnected: true,
        lastSync: Date.now() - 900000, // 15 mins ago
        syncInterval: 30,
      },
      {
        id: 'michael-bp',
        type: 'bp_monitor',
        name: 'A&D Medical Deluxe',
        batteryLevel: 82,
        isConnected: true,
        lastSync: Date.now() - 10800000, // 3 hours ago
        syncInterval: 180,
      },
      {
        id: 'michael-watch',
        type: 'smartwatch',
        name: 'Apple Watch Series 9',
        batteryLevel: 67,
        isConnected: true,
        lastSync: Date.now(),
        syncInterval: 5,
      },
    ],
    
    agentConfig: {
      personality: 'brief',
      responseDelay: 600,
    },
    
    isConnected: true,
    lastActivity: Date.now(),
    currentActivity: 'Morning routine',
    nextActivity: 'Breakfast',
    nextActivityTime: Date.now() + 900000, // 15 mins
  },
};

// Normal vital ranges for each patient
export const PATIENT_VITAL_RANGES: Record<PatientId, {
  heartRate: { min: number; max: number; resting: number };
  bloodPressure?: { systolic: { min: number; max: number }; diastolic: { min: number; max: number } };
  bloodGlucose?: { min: number; max: number; target: number };
  oxygenSaturation: { min: number; max: number };
  sleepScore: { min: number; max: number };
}> = {
  self: {
    heartRate: { min: 48, max: 140, resting: 64 },
    bloodPressure: { systolic: { min: 95, max: 145 }, diastolic: { min: 60, max: 92 } },
    oxygenSaturation: { min: 94, max: 100 },
    sleepScore: { min: 50, max: 92 },
  },
  sarah: {
    heartRate: { min: 55, max: 160, resting: 65 },
    bloodPressure: { systolic: { min: 100, max: 140 }, diastolic: { min: 60, max: 90 } },
    bloodGlucose: { min: 60, max: 250, target: 100 },
    oxygenSaturation: { min: 95, max: 100 },
    sleepScore: { min: 60, max: 95 },
  },
  robert: {
    heartRate: { min: 50, max: 140, resting: 60 },
    bloodPressure: { systolic: { min: 120, max: 170 }, diastolic: { min: 70, max: 100 } },
    oxygenSaturation: { min: 92, max: 99 },
    sleepScore: { min: 45, max: 85 },
  },
  emma: {
    heartRate: { min: 55, max: 130, resting: 68 },
    bloodPressure: { systolic: { min: 95, max: 135 }, diastolic: { min: 60, max: 85 } },
    oxygenSaturation: { min: 94, max: 100 },
    sleepScore: { min: 40, max: 80 },
  },
  michael: {
    heartRate: { min: 50, max: 120, resting: 58 },
    bloodPressure: { systolic: { min: 105, max: 150 }, diastolic: { min: 65, max: 90 } },
    oxygenSaturation: { min: 94, max: 100 },
    sleepScore: { min: 65, max: 90 },
  },
};

// Typical daily schedules for each patient
export const PATIENT_SCHEDULES: Record<PatientId, {
  wakeTime: number; // minutes from midnight
  sleepTime: number;
  meals: { name: string; time: number }[];
  activities: { name: string; start: number; duration: number; location: string }[];
}> = {
  self: {
    wakeTime: 450,
    sleepTime: 1380,
    meals: [
      { name: 'Breakfast', time: 480 },
      { name: 'Lunch', time: 780 },
      { name: 'Dinner', time: 1140 },
    ],
    activities: [
      { name: 'Phone check-in', start: 510, duration: 15, location: 'home' },
      { name: 'Daily routine', start: 540, duration: 480, location: 'home' },
      { name: 'Evening review', start: 1200, duration: 20, location: 'home' },
    ],
  },
  sarah: {
    wakeTime: 420, // 7:00 AM
    sleepTime: 1380, // 11:00 PM
    meals: [
      { name: 'Breakfast', time: 450 }, // 7:30 AM
      { name: 'Lunch', time: 750 }, // 12:30 PM
      { name: 'Dinner', time: 1140 }, // 7:00 PM
    ],
    activities: [
      { name: 'Morning workout', start: 480, duration: 60, location: 'home' },
      { name: 'Work', start: 540, duration: 480, location: 'home' },
      { name: 'Evening walk', start: 1080, duration: 45, location: 'outdoor' },
    ],
  },
  robert: {
    wakeTime: 480, // 8:00 AM
    sleepTime: 60, // 1:00 AM (next day)
    meals: [
      { name: 'Breakfast', time: 510 },
      { name: 'Lunch', time: 780 },
      { name: 'Dinner', time: 1200 },
    ],
    activities: [
      { name: 'Meetings', start: 540, duration: 360, location: 'home' },
      { name: 'Deep work', start: 900, duration: 300, location: 'home' },
      { name: 'Late work', start: 1260, duration: 120, location: 'home' },
    ],
  },
  emma: {
    wakeTime: 540, // 9:00 AM (sleeps in due to fatigue)
    sleepTime: 1320, // 10:00 PM
    meals: [
      { name: 'Breakfast', time: 570 },
      { name: 'Lunch', time: 810 },
      { name: 'Dinner', time: 1110 },
    ],
    activities: [
      { name: 'Gentle stretching', start: 600, duration: 20, location: 'home' },
      { name: 'Work (with breaks)', start: 630, duration: 360, location: 'home' },
      { name: 'Rest', start: 1020, duration: 120, location: 'home' },
    ],
  },
  michael: {
    wakeTime: 360, // 6:00 AM
    sleepTime: 1320, // 10:00 PM
    meals: [
      { name: 'Breakfast', time: 390 },
      { name: 'Lunch', time: 720 },
      { name: 'Dinner', time: 1080 },
    ],
    activities: [
      { name: 'Morning routine', start: 360, duration: 90, location: 'home' },
      { name: 'Reading', start: 480, duration: 120, location: 'home' },
      { name: 'Walk', start: 630, duration: 30, location: 'outdoor' },
      { name: 'Hobbies', start: 840, duration: 180, location: 'home' },
    ],
  },
};

// Agent response templates
export const AGENT_RESPONSES: Record<PatientId, {
  greetings: string[];
  symptomAcknowledgments: string[];
  positiveFeedback: string[];
  concerns: string[];
}> = {
  self: {
    greetings: [
      'I am ready to log a new check-in whenever you are.',
      'Tell me what you are feeling and I will add it to your history.',
      'Manual journal is active. We can capture symptoms, timing, and severity.',
    ],
    symptomAcknowledgments: [
      'Logged. I will keep that in your ongoing history.',
      'Noted. I can help turn that into a clinician-ready summary later.',
      'Captured. If it worsens, we can escalate it for review.',
    ],
    positiveFeedback: [
      'Consistent check-ins make the history much more useful.',
      'Your symptom journal is staying organized and easy to review.',
      'Good entry. The timeline stays clearer when you include timing and severity.',
    ],
    concerns: [
      'That pattern may be worth clinician review if it continues.',
      'This sounds more significant than a routine check-in. Consider escalating it.',
      'If severity rises or red-flag symptoms appear, we should route this to a doctor.',
    ],
  },
  sarah: {
    greetings: [
      "Hey there! Ready to tackle the day? 💪",
      "Good morning! How are you feeling today?",
      "Hi Sarah! Your glucose has been stable overnight.",
    ],
    symptomAcknowledgments: [
      "I see, that must be uncomfortable. Let me log that.",
      "Thanks for letting me know. I'll track this.",
      "Noted. Have you noticed any patterns with this?",
    ],
    positiveFeedback: [
      "Great job on your morning workout! 🎉",
      "Your glucose control has been excellent today!",
      "You're doing amazing with your health management!",
    ],
    concerns: [
      "I'm noticing a pattern here. Should we alert Dr. Chen?",
      "This seems unusual for you. Let's keep an eye on it.",
      "Your readings are outside your normal range. How do you feel?",
    ],
  },
  robert: {
    greetings: [
      "Good morning, Robert. I hope you slept well.",
      "Hello. I've prepared your morning health summary.",
      "Good day. Your sleep quality was rated at 72% last night.",
    ],
    symptomAcknowledgments: [
      "I understand. This has been recorded in your log.",
      "Thank you for the detailed information.",
      "I'll make a note of this for your records.",
    ],
    positiveFeedback: [
      "Excellent blood pressure readings this morning.",
      "Your sleep apnea events have decreased. Good progress.",
      "Well done on maintaining your medication schedule.",
    ],
    concerns: [
      "Your blood pressure reading is elevated. Are you feeling stressed?",
      "This is the third headache this week. We should discuss this with Dr. Rodriguez.",
      "Your sleep quality has declined. Any changes in routine?",
    ],
  },
  emma: {
    greetings: [
      "Hi Emma! How's your energy level today? 🌸",
      "Good morning. Remember to pace yourself today.",
      "Hello! Your heart rate variability looks good this morning.",
    ],
    symptomAcknowledgments: [
      "I'm sorry you're dealing with that. Let me log it.",
      "That sounds difficult. I'll track this symptom.",
      "Thank you for sharing. Every data point helps us understand your patterns.",
    ],
    positiveFeedback: [
      "You're having a good day! Your energy levels are up! 💚",
      "Great job on the gentle stretching!",
      "Your resting heart rate has improved. Keep it up!",
    ],
    concerns: [
      "I'm seeing signs of fatigue. Please consider resting.",
      "Your oxygen levels dipped slightly. Are you feeling okay?",
      "This symptom flare might need attention. Should we contact Dr. Patel?",
    ],
  },
  michael: {
    greetings: [
      "Good morning, Michael. Your heart rhythm was normal overnight.",
      "Hello! All your morning readings look good.",
      "Good day to you. Your medication reminder is set.",
    ],
    symptomAcknowledgments: [
      "Noted. I'll include this in your daily report.",
      "Thank you for reporting that promptly.",
      "I've logged that symptom for Dr. Chen's review.",
    ],
    positiveFeedback: [
      "Excellent! Your ECG readings are stable.",
      "Perfect medication adherence this week. Well done!",
      "Your blood pressure is within target range. Keep it up!",
    ],
    concerns: [
      "I detected an irregular heartbeat. Please take an ECG reading.",
      "This reading is outside your normal parameters. How are you feeling?",
      "Your heart rate variability has changed. Let's monitor this closely.",
    ],
  },
};
