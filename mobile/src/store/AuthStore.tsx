import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../services/firebase';
import { teachflowData } from '../services/teachflowData';
import { CoachingClass, UserProfile, UserRole } from '../types/Models';

export type { UserRole } from '../types/Models';

type AuthContextValue = {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  currentClass: CoachingClass | null;
  initializing: boolean;
  loggingIn: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshAuthData: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchUserProfile = async (firebaseUser: FirebaseUser): Promise<UserProfile> => {
  const profile = await teachflowData.getUserProfile(firebaseUser.uid, firebaseUser.email);

  if (!profile) {
    console.log('User document missing');
    throw new Error('User profile not found in Firestore.');
  }

  return profile;
};

const fetchClassesForProfile = async (profile: UserProfile) => {
  if (profile.role === 'admin') {
    return teachflowData.getClassesByAdmin(profile.uid);
  }

  return teachflowData.getClassesByIds(profile.classIds);
};

const uniqueClasses = (classes: CoachingClass[]) => {
  const map = new Map<string, CoachingClass>();
  classes.forEach((entry) => map.set(entry.id, entry));
  return Array.from(map.values());
};

const rolePriority: UserRole[] = ['admin', 'teacher', 'student', 'parent'];

const resolveProfileAndClasses = async (profile: UserProfile, firebaseUser: FirebaseUser) => {
  if (profile.role === 'super_admin') {
    return {
      profile,
      classes: await fetchClassesForProfile(profile),
    };
  }

  const contexts = await teachflowData.inferMembershipContexts(profile.uid, firebaseUser.email);
  const availableRoles = new Set<UserRole>();

  if (contexts.adminClasses.length > 0) availableRoles.add('admin');
  if (contexts.teacherContexts.length > 0) availableRoles.add('teacher');
  if (contexts.studentContexts.length > 0) availableRoles.add('student');
  if (contexts.parentContexts.length > 0 || profile.linkedStudentIds.length > 0 || Boolean(profile.linkedStudentId)) availableRoles.add('parent');

  const resolvedRole =
    (availableRoles.has(profile.role) ? profile.role : rolePriority.find((role) => availableRoles.has(role))) ?? profile.role;

  const roleClasses =
    resolvedRole === 'admin'
      ? contexts.adminClasses
      : resolvedRole === 'teacher'
        ? contexts.teacherContexts.map((entry) => entry.classData)
        : resolvedRole === 'student'
          ? contexts.studentContexts.map((entry) => entry.classData)
          : resolvedRole === 'parent'
            ? contexts.parentContexts.map((entry) => entry.classData)
            : await fetchClassesForProfile(profile);

  const dedupedClasses = uniqueClasses([...(await fetchClassesForProfile(profile)), ...roleClasses]);
  const firstStudent = contexts.studentContexts[0]?.student ?? null;
  const linkedStudentIds =
    resolvedRole === 'parent'
      ? Array.from(
          new Set([
            ...profile.linkedStudentIds,
            ...(profile.linkedStudentId ? [profile.linkedStudentId] : []),
            ...contexts.parentContexts.flatMap((entry) => entry.parentStudents.map((student) => student.id)),
          ])
        )
      : profile.linkedStudentIds;

  return {
    profile: {
      ...profile,
      role: resolvedRole,
      classIds: dedupedClasses.map((item) => item.id),
      activeClassId: profile.activeClassId ?? dedupedClasses[0]?.id ?? null,
      batchId: resolvedRole === 'student' ? firstStudent?.batchId ?? profile.batchId : profile.batchId,
      linkedStudentIds,
      linkedStudentId: resolvedRole === 'parent' ? profile.linkedStudentId ?? linkedStudentIds[0] ?? null : profile.linkedStudentId,
    },
    classes: dedupedClasses,
  };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentClass, setCurrentClass] = useState<CoachingClass | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAuthData = async () => {
    if (!auth.currentUser) {
      setFirebaseUser(null);
      setUserProfile(null);
      setCurrentClass(null);
      return;
    }

    const profile = await fetchUserProfile(auth.currentUser);
    const resolved = await resolveProfileAndClasses(profile, auth.currentUser);
    const resolvedClassId = resolved.profile.activeClassId ?? resolved.profile.classIds[0] ?? resolved.classes[0]?.id ?? null;
    const resolvedClass = resolved.classes.find((item) => item.id === resolvedClassId) ?? resolved.classes[0] ?? null;

    console.log('ROLE:', resolved.profile.role);
    setFirebaseUser(auth.currentUser);
    setUserProfile(resolved.profile);
    setCurrentClass(resolvedClass);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);
      setError(null);

      if (!nextUser) {
        setUserProfile(null);
        setCurrentClass(null);
        setInitializing(false);
        return;
      }

      try {
        await refreshAuthData();
      } catch (profileError) {
        const message = profileError instanceof Error ? profileError.message : 'Failed to load user profile.';
        setUserProfile(null);
        setCurrentClass(null);
        setError(message);
      } finally {
        setInitializing(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    setLoggingIn(true);
    setError(null);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      setFirebaseUser(credential.user);
      await refreshAuthData();
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'Login failed.';
      setUserProfile(null);
      setCurrentClass(null);
      setError(message);
      throw loginError;
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setUserProfile(null);
    setCurrentClass(null);
    setError(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      userProfile,
      currentClass,
      initializing,
      loggingIn,
      error,
      login,
      logout,
      clearError: () => setError(null),
      refreshAuthData,
    }),
    [currentClass, error, firebaseUser, initializing, loggingIn, userProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};
