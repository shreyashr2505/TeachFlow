import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  type AuthError,
  getIdToken,
  type User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { firebaseService } from '../services/firebaseService';
import { CoachingClass, User } from '../types';

interface AuthContextType {
  user: User | null;
  classes: CoachingClass[];
  currentClass: CoachingClass | null;
  currentClassId: string | null;
  login: (email: string, password: string, tenantSlug?: string) => Promise<boolean>;
  signup: (
    email: string,
    password: string,
    name: string,
    role: User['role'],
    tenantSlug?: string
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
  createClass: (classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) => Promise<boolean>;
  setCurrentClass: (classData: CoachingClass) => void;
  switchClass: (classId: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [currentClassId, setCurrentClassId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resetAuthState = () => {
      setUser(null);
      setClasses([]);
      setCurrentClassId(null);
  };

  const isPermissionError = (error: unknown): boolean => {
    const normalized = error as { code?: string; message?: string; cause?: unknown } | undefined;
    if (!normalized) return false;

    if (normalized.code === 'permission-denied') {
      return true;
    }

    if (normalized.message?.toLowerCase().includes('insufficient permissions')) {
      return true;
    }

    return Boolean(normalized.cause && isPermissionError(normalized.cause));
  };

  const getAuthErrorCode = (error: unknown): string | undefined => {
    const normalized = error as { code?: string; cause?: unknown } | undefined;
    if (!normalized) return undefined;
    return normalized.code ?? getAuthErrorCode(normalized.cause);
  };

  const buildFallbackProfile = (
    firebaseUser: FirebaseUser,
    role: User['role'] = 'student'
  ): Omit<User, 'createdAt'> => ({
    id: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    name: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'TeachFlow User',
    role,
    approved: role === 'admin' || role === 'super_admin',
    classIds: [],
    activeClassId: undefined,
    classId: undefined,
  });

  const ensureUserProfile = async (
    firebaseUser: FirebaseUser,
    preferredRole: User['role'] = 'student'
  ) => {
    try {
      const profile = await firebaseService.getUserProfile(firebaseUser.uid);
      if (profile) {
        return profile;
      }
    } catch (error) {
      if (isPermissionError(error)) {
        throw new Error(
          'Firestore rules are blocking access to your user profile. Publish the latest Firestore rules in Firebase Console and try again.'
        );
      }

      throw error;
    }

    try {
      return await firebaseService.upsertUser(buildFallbackProfile(firebaseUser, preferredRole));
    } catch (error) {
      if (isPermissionError(error)) {
        throw new Error(
          'Firestore rules are blocking TeachFlow from creating your user profile. Publish the latest Firestore rules in Firebase Console and try again.'
        );
      }

      throw error;
    }
  };




  const refreshUserData = async () => {
    if (!auth.currentUser) {
      resetAuthState();
      return;
    }

    const profile = await firebaseService.getUserProfile(auth.currentUser.uid);
    if (!profile) {
      // FIX: Stop the Auth Listener Loop. If signup is still currently running 
      // and hasn't created the profile yet, do NOT auto-generate a fallback student profile!
      return;
    }

    if (profile.role === 'super_admin') {
      setUser({
        ...profile,
        classId: undefined,
        activeClassId: undefined,
        classIds: [],
      });
      setClasses([]);
      setCurrentClassId(null);
      return;
    }

    const userClasses =
      profile.role === 'admin'
        ? await firebaseService.getClassesByAdmin(profile.id)
        : await firebaseService.getClassesByIds(profile.classIds ?? []);

    const resolvedCurrentClassId =
      profile.activeClassId ?? profile.classId ?? userClasses[0]?.id ?? null;

    setUser({
      ...profile,
      classId: resolvedCurrentClassId ?? undefined,
      activeClassId: resolvedCurrentClassId ?? undefined,
      classIds: profile.classIds ?? userClasses.map((item) => item.id),
    });
    setClasses(userClasses);
    setCurrentClassId(resolvedCurrentClassId);
  };

  const tryAcceptInvites = async (userId: string, email: string) => {
    try {
      if (user?.role === 'super_admin') {
        return;
      }

      if (auth.currentUser) {
        await getIdToken(auth.currentUser, true);
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      await firebaseService.acceptInvitesForUser(userId, email);
    } catch (error) {
      if (isPermissionError(error)) {
        console.warn(
          'Invite sync skipped because Firestore invites rules are still denying reads. Publish the latest rules in Firebase Console to enable invite linking.'
        );
        return;
      }

      console.warn('Invite sync skipped during auth.', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (!firebaseUser) {
        resetAuthState();
        setIsLoading(false);
        return;
      }

      try {
        await refreshUserData();
      } catch (error) {
        console.error('Failed to refresh authenticated user state.', error);
        resetAuthState();
        await signOut(auth);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string, tenantSlug?: string) => {
    try {
      
      let targetClass: CoachingClass | null = null;
      if (tenantSlug) {
        targetClass = await firebaseService.getClassBySlug(tenantSlug);
        if (!targetClass) {
          throw new Error('Class not found. Please check the URL.');
        }
      }

      const credential = await signInWithEmailAndPassword(auth, email, password);
      
      const rawProfile = await firebaseService.getUserProfile(credential.user.uid);
      if (rawProfile?.role !== 'super_admin') {
        await tryAcceptInvites(credential.user.uid, credential.user.email ?? email);
      }

      const profile = await ensureUserProfile(credential.user);

      if (tenantSlug && targetClass && profile) {
        const existingClassIds = profile.classIds ?? (profile.classId ? [profile.classId] : []);
        const isSuperAdmin = profile.role === 'super_admin';
        
        if (!isSuperAdmin && !existingClassIds.includes(targetClass.id)) {
          await signOut(auth);
          throw new Error('No user found in this class. Please sign up or ask for an invite.');
        }

        if (!isSuperAdmin) {
          await firebaseService.switchUserClass(credential.user.uid, targetClass.id);
        }
      }

      await refreshUserData();
      return true;
    } catch (error: any) {
      console.error('Login failed', error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password');
      }
      throw error;
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    role: User['role'],
    tenantSlug?: string
  ) => {
    try {
      if (tenantSlug && role === 'admin') {
        throw new Error('Admins must create a class from the main TeachFlow login, not from a class signup link.');
      }

      let targetClass: CoachingClass | null = null;
      if (tenantSlug) {
        targetClass = await firebaseService.getClassBySlug(tenantSlug);
        if (!targetClass) {
          throw new Error('Class not found. Please check the URL.');
        }
        if (!targetClass.settings.allowSelfRegistration) {
          throw new Error('Self-registration is disabled for this class. Please ask the admin to invite you.');
        }
      }

      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });

      const isAutoApproved =
        role === 'admin' ||
        role === 'super_admin' ||
        (targetClass ? !targetClass.settings.requireApproval : false);

      await firebaseService.upsertUser({
        id: credential.user.uid,
        email,
        name,
        role,
        approved: isAutoApproved,
        classIds: targetClass ? [targetClass.id] : [],
        activeClassId: targetClass?.id,
        classId: targetClass?.id,
      });

      if (!targetClass) {
        await tryAcceptInvites(credential.user.uid, email);
      }
      await refreshUserData();
      return true;
    } catch (error: any) {
      const code = getAuthErrorCode(error);
      if (code === 'auth/email-already-in-use') {
        try {
          const credential = await signInWithEmailAndPassword(auth, email, password);
          if (tenantSlug) {
            const targetClass = await firebaseService.getClassBySlug(tenantSlug);
            if (targetClass) {
              await firebaseService.linkUserToClass(credential.user.uid, targetClass.id);
            }
          }
          await refreshUserData();
          return true;
        } catch (signInError: any) {
          console.warn('Signup fallback login failed for existing account.', signInError);
          if (signInError.code === 'auth/invalid-credential' || signInError.code === 'auth/wrong-password') {
            throw new Error('Account already exists, but incorrect password. Please sign in instead.');
          }
          throw signInError;
        }
      } else {
        console.error('Signup failed', error);
        throw error;
      }
    }
  };

  const createClass = async (classData: Omit<CoachingClass, 'id' | 'adminId' | 'createdAt'>) => {
    if (!user) return false;

    try {
      const createdClass = await firebaseService.createClass(user.id, classData);
      const nextClasses = [...classes, createdClass];
      setClasses(nextClasses);
      setCurrentClassId(createdClass.id);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              classIds: Array.from(new Set([...(prev.classIds ?? []), createdClass.id])),
              classId: createdClass.id,
              activeClassId: createdClass.id,
            }
          : prev
      );
      return true;
    } catch (error) {
      console.error('Create class failed', error);
      return false;
    }
  };

  const switchClass = async (classId: string) => {
    if (!user) return;
    await firebaseService.switchUserClass(user.id, classId);
    setCurrentClassId(classId);
    setUser((prev) => (prev ? { ...prev, classId, activeClassId: classId } : prev));
  };

  const handleSetCurrentClass = (classData: CoachingClass) => {
    setCurrentClassId(classData.id);
    setUser((prev) => (prev ? { ...prev, classId: classData.id, activeClassId: classData.id } : prev));
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setClasses([]);
    setCurrentClassId(null);
  };

  const currentClass = useMemo(
    () => classes.find((item) => item.id === currentClassId) ?? null,
    [classes, currentClassId]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        classes,
        currentClass,
        currentClassId,
        login,
        signup,
        logout,
        isLoading,
        createClass,
        setCurrentClass: handleSetCurrentClass,
        switchClass,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
