import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { teachflowService } from '../services/teachflow';
import { CoachingClass, PlanSettings, User } from '../types';
import { DEFAULT_PLAN_SETTINGS, setPlanSettingsCache } from '../utils/plan';

type AuthContextValue = {
  user: User | null;
  classes: CoachingClass[];
  currentClass: CoachingClass | null;
  currentClassId: string | null;
  isLoading: boolean;
  planSettings: PlanSettings;
  login: (email: string, password: string, role?: User['role']) => Promise<boolean>;
  signup: (email: string, password: string, name: string, role: User['role']) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  createClass: (classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) => Promise<boolean>;
  switchClass: (classId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
};

const buildFallbackProfile = (firebaseUser: FirebaseUser, role: User['role'] = 'student'): Omit<User, 'createdAt'> => ({
  id: firebaseUser.uid,
  email: firebaseUser.email ?? '',
  name: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'TeachFlow User',
  role,
  approved: role === 'admin' || role === 'super_admin',
  classIds: [],
  classId: undefined,
  activeClassId: undefined,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [currentClassId, setCurrentClassId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [planSettings, setPlanSettings] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);

  const currentClass = useMemo(() => classes.find((item) => item.id === currentClassId) ?? null, [classes, currentClassId]);

  const resetState = () => {
    setUser(null);
    setClasses([]);
    setCurrentClassId(null);
  };

  const refreshUserData = async () => {
    if (!auth.currentUser) {
      resetState();
      return;
    }

    const profile = await teachflowService.getUserProfile(auth.currentUser.uid);
    if (!profile) return;

    if (profile.role === 'super_admin') {
      setUser({ ...profile, classId: undefined, activeClassId: undefined, classIds: [] });
      setClasses([]);
      setCurrentClassId(null);
      return;
    }

    const userClasses = profile.role === 'admin'
      ? await teachflowService.getClassesByAdmin(profile.id)
      : await teachflowService.getClassesByIds(profile.classIds ?? []);

    const requestedClassId = profile.activeClassId ?? profile.classId ?? null;
    const requestedClass = userClasses.find((item) => item.id === requestedClassId);
    const fallbackClass = userClasses.find((item) => item.isActive) ?? userClasses[0] ?? null;
    const resolvedClassId = requestedClass?.isActive !== false ? requestedClass?.id ?? fallbackClass?.id ?? null : fallbackClass?.id ?? null;

    setUser({
      ...profile,
      classId: resolvedClassId ?? undefined,
      activeClassId: resolvedClassId ?? undefined,
      classIds: profile.classIds ?? userClasses.map((item) => item.id),
    });
    setClasses(userClasses);
    setCurrentClassId(resolvedClassId);
  };

  useEffect(() => {
    const unsubscribe = teachflowService.subscribeToPlanSettings((settings) => {
      setPlanSettings(settings);
      setPlanSettingsCache(settings);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (!firebaseUser) {
        resetState();
        setIsLoading(false);
        return;
      }

      try {
        await refreshUserData();
      } catch (error) {
        console.error('Failed to refresh auth state', error);
        resetState();
        await signOut(auth);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string, role: User['role'] = 'student') => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const existing = await teachflowService.getUserProfile(credential.user.uid);
    if (!existing) {
      await teachflowService.upsertUser(buildFallbackProfile(credential.user, role));
    }
    if (credential.user.displayName == null) {
      await updateProfile(credential.user, { displayName: email.split('@')[0] });
    }
    await refreshUserData();
    void teachflowService.trackGrowthEvent({ type: 'login', source: 'mobile_login', userId: credential.user.uid }).catch(() => undefined);
    return true;
  };

  const signup = async (email: string, password: string, name: string, role: User['role']) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await teachflowService.upsertUser({
      id: credential.user.uid,
      email,
      name,
      role,
      approved: role === 'admin' || role === 'super_admin',
      classIds: [],
    });
    await refreshUserData();
    void teachflowService.trackGrowthEvent({ type: 'signup', source: 'mobile_signup', userId: credential.user.uid }).catch(() => undefined);
    return true;
  };

  const logout = async () => {
    await signOut(auth);
    resetState();
  };

  const createClass = async (classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) => {
    if (!user) return false;
    const created = await teachflowService.createClass(user.id, classData);
    setClasses((prev) => [...prev, created]);
    setCurrentClassId(created.id);
    setUser((prev) => (prev ? { ...prev, classIds: Array.from(new Set([...(prev.classIds ?? []), created.id])), classId: created.id, activeClassId: created.id } : prev));
    return true;
  };

  const switchClass = async (classId: string) => {
    if (!user) return;
    await teachflowService.switchUserClass(user.id, classId);
    setCurrentClassId(classId);
    setUser((prev) => (prev ? { ...prev, classId, activeClassId: classId } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        classes,
        currentClass,
        currentClassId,
        isLoading,
        planSettings,
        login,
        signup,
        logout,
        refreshUserData,
        createClass,
        switchClass,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
