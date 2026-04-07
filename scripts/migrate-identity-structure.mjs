import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DELETE_FIELD = Symbol('deleteField');
const isCommitMode = process.argv.includes('--commit');
const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
const mismatchTargets = [
  { oldId: 'CBcyHCMunbgrebf0iwn9', classId: 'sfGj8c7DxdCiKR66N5Wf' },
  { oldId: 'QVYQKaeV8DU315atI3Bj', classId: 'sfGj8c7DxdCiKR66N5Wf' },
  { oldId: 'quap9gqgBr5KZdaAAluX', classId: 'sfGj8c7DxdCiKR66N5Wf' },
];

if (!projectId) {
  console.error('Missing VITE_FIREBASE_PROJECT_ID in environment.');
  process.exit(1);
}

const encodeFirestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeFirestoreValue(item)) } };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, encodeFirestoreValue(entry)])
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
};

const decodeFirestoreValue = (value) => {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item));
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, entry]) => [key, decodeFirestoreValue(entry)])
    );
  }
  return undefined;
};

const decodeDocument = (document) => ({
  id: document.name.split('/').pop(),
  name: document.name,
  data: Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeFirestoreValue(value)])
  ),
});

const getCliAuth = () => {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('No Firebase CLI refresh token found. Run `firebase login` first.');
  }
  return {
    refreshToken,
    accessToken: config?.tokens?.access_token ?? null,
  };
};

let cachedAccessToken = null;

const getAccessToken = async () => {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  if (process.env.FIREBASE_ACCESS_TOKEN) {
    cachedAccessToken = process.env.FIREBASE_ACCESS_TOKEN;
    return cachedAccessToken;
  }

  const cliAuth = getCliAuth();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: cliAuth.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to refresh Firebase CLI access token: ${response.status} ${response.statusText}: ${body}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token ?? cliAuth.accessToken;
  return cachedAccessToken;
};

const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const documentNamePrefix = `projects/${projectId}/databases/(default)/documents/`;

const counters = {
  usersUpdated: 0,
  studentsUpdated: 0,
  parentUsersUpdated: 0,
  studentDocsRekeyed: 0,
  relatedDocsUpdated: 0,
  warnings: 0,
  studentIdMismatches: 0,
};

const firestoreFetch = async (url, options = {}) => {
  const accessToken = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const listDocuments = async (collectionPath) => {
  let url = `${baseUrl}/${collectionPath}?pageSize=1000`;
  const docs = [];

  while (url) {
    const data = await firestoreFetch(url);
    docs.push(...(data.documents ?? []).map(decodeDocument));
    url = data.nextPageToken
      ? `${baseUrl}/${collectionPath}?pageSize=1000&pageToken=${encodeURIComponent(data.nextPageToken)}`
      : null;
  }

  return docs;
};

const patchDocument = async (relativePath, updates) => {
  const entries = Object.entries(updates);
  const updateMask = entries.map(([key]) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
  const fields = Object.fromEntries(
    entries
      .filter(([, value]) => value !== DELETE_FIELD)
      .map(([key, value]) => [key, encodeFirestoreValue(value)])
  );

  const url = `${baseUrl}/${relativePath}?${updateMask}`;

  if (!isCommitMode) {
    console.log('[dry-run] patch', relativePath, updates);
    return;
  }

  await firestoreFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  console.log('[commit] patch', relativePath);
};

const writeDocument = async (relativePath, data) => {
  const fields = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)])
  );
  const url = `${baseUrl}/${relativePath}`;

  if (!isCommitMode) {
    console.log('[dry-run] write', relativePath, data);
    return;
  }

  await firestoreFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  console.log('[commit] write', relativePath);
};

const deleteDocument = async (relativePath) => {
  const url = `${baseUrl}/${relativePath}`;

  if (!isCommitMode) {
    console.log('[dry-run] delete', relativePath);
    return;
  }

  await firestoreFetch(url, { method: 'DELETE' });
  console.log('[commit] delete', relativePath);
};

const getDocument = async (relativePath) => {
  try {
    const data = await firestoreFetch(`${baseUrl}/${relativePath}`);
    return decodeDocument(data);
  } catch (error) {
    if (String(error.message).includes('404')) {
      return null;
    }
    throw error;
  }
};

const toRelativePath = (documentName) => {
  if (!documentName.startsWith(documentNamePrefix)) {
    throw new Error(`Unexpected document name: ${documentName}`);
  }
  return documentName.slice(documentNamePrefix.length);
};

const uniqueStrings = (value) =>
  Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.trim().length > 0))] : [];

async function migrate() {
  console.log(`Starting identity migration in ${isCommitMode ? 'COMMIT' : 'DRY-RUN'} mode for ${projectId}...`);

  const users = await listDocuments('users');
  const userMap = new Map(users.map((user) => [user.id, user]));
  const userIdsByEmail = users.reduce((acc, user) => {
    const email = typeof user.data.email === 'string' ? user.data.email : '';
    if (!email) return acc;
    acc[email] = [...new Set([...(acc[email] ?? []), user.id])];
    return acc;
  }, {});

  for (const user of users) {
    const data = user.data;
    const updates = {};

    if (data.linkedStudentId && (!Array.isArray(data.linkedStudentIds) || data.linkedStudentIds.length === 0)) {
      updates.linkedStudentIds = [data.linkedStudentId];
      updates.linkedStudentId = DELETE_FIELD;
    } else if (!Array.isArray(data.linkedStudentIds)) {
      updates.linkedStudentIds = [];
    }

    if (!Array.isArray(data.classIds)) {
      updates.classIds = typeof data.classId === 'string' && data.classId.trim().length > 0 ? [data.classId] : [];
    }

    if (data.batch && !data.batchId) {
      updates.batchId = data.batch;
      updates.batch = DELETE_FIELD;
    }

    if (Object.keys(updates).length > 0) {
      await patchDocument(`users/${user.id}`, updates);
      counters.usersUpdated += 1;
    }
  }

  const classes = await listDocuments('classes');

  for (const coachingClass of classes) {
    const classId = coachingClass.id;
    const students = await listDocuments(`classes/${classId}/students`);

    for (const student of students) {
      const data = student.data;
      const updates = {};

      if (data.parentEmail) {
        updates.parentIds = userIdsByEmail[data.parentEmail] ?? [];
        updates.parentEmail = DELETE_FIELD;
      } else if (!Array.isArray(data.parentIds)) {
        updates.parentIds = [];
      }

      if (data.batch && !data.batchId) {
        updates.batchId = data.batch;
        updates.batch = DELETE_FIELD;
      }

      if (Object.keys(updates).length > 0) {
        await patchDocument(`classes/${classId}/students/${student.id}`, updates);
        counters.studentsUpdated += 1;
      }

      if (!userMap.has(student.id)) {
        counters.studentIdMismatches += 1;
        counters.warnings += 1;
        console.warn(`[warning] Student ${classId}/${student.id} has no matching users/${student.id}. Manual rebuild required.`);
        continue;
      }

      const parentIds = uniqueStrings(updates.parentIds ?? data.parentIds);
      for (const parentId of parentIds) {
        const parentUser = userMap.get(parentId);
        if (!parentUser) {
          counters.warnings += 1;
          console.warn(`[warning] Parent user ${parentId} referenced by student ${student.id} was not found.`);
          continue;
        }

        const currentLinks = uniqueStrings(parentUser.data.linkedStudentIds ?? (parentUser.data.linkedStudentId ? [parentUser.data.linkedStudentId] : []));
        if (!currentLinks.includes(student.id)) {
          await patchDocument(`users/${parentId}`, {
            linkedStudentIds: [...currentLinks, student.id],
            linkedStudentId: DELETE_FIELD,
          });
          counters.parentUsersUpdated += 1;
        }
      }

      const studentUser = userMap.get(student.id);
      if (data.batch && !studentUser.data.batchId) {
        await patchDocument(`users/${student.id}`, {
          batchId: data.batch,
          batch: DELETE_FIELD,
        });
        counters.usersUpdated += 1;
      }
    }
  }

  for (const mismatch of mismatchTargets) {
    const oldPath = `classes/${mismatch.classId}/students/${mismatch.oldId}`;
    const oldStudent = await getDocument(oldPath);

    if (!oldStudent) {
      counters.warnings += 1;
      console.warn(`[warning] Missing mismatch target ${oldPath}.`);
      continue;
    }

    const email = typeof oldStudent.data.email === 'string' ? oldStudent.data.email : '';
    const matchingUserIds = userIdsByEmail[email] ?? [];
    const newUserId = matchingUserIds[0];

    if (!newUserId) {
      counters.warnings += 1;
      console.warn(`[warning] No matching user found by email for ${oldPath}.`);
      continue;
    }

    if (newUserId === mismatch.oldId) {
      continue;
    }

    const newPath = `classes/${mismatch.classId}/students/${newUserId}`;
    const existingNewStudent = await getDocument(newPath);
    if (existingNewStudent) {
      counters.warnings += 1;
      console.warn(`[warning] Target student document already exists at ${newPath}. Skipping rekey.`);
      continue;
    }

    await writeDocument(newPath, {
      ...oldStudent.data,
      migratedFrom: mismatch.oldId,
    });

    const parentIds = uniqueStrings(oldStudent.data.parentIds);
    for (const parentId of parentIds) {
      const parentUser = userMap.get(parentId);
      if (!parentUser) continue;
      const linkedIds = uniqueStrings(parentUser.data.linkedStudentIds ?? (parentUser.data.linkedStudentId ? [parentUser.data.linkedStudentId] : []));
      const nextIds = [...new Set([...linkedIds.filter((id) => id !== mismatch.oldId), newUserId])];
      await patchDocument(`users/${parentId}`, {
        linkedStudentIds: nextIds,
        linkedStudentId: DELETE_FIELD,
      });
      counters.parentUsersUpdated += 1;
    }

    const relatedCollections = [
      { path: `classes/${mismatch.classId}/attendance`, field: 'studentId' },
      { path: `classes/${mismatch.classId}/marks`, field: 'studentId' },
      { path: `classes/${mismatch.classId}/fees`, field: 'studentId' },
      { path: 'reports', field: 'studentId', extraMatch: { classId: mismatch.classId } },
      { path: 'invites', field: 'studentId', extraMatch: { classId: mismatch.classId } },
    ];

    for (const target of relatedCollections) {
      const docs = await listDocuments(target.path);
      for (const docItem of docs) {
        if (docItem.data[target.field] !== mismatch.oldId) {
          continue;
        }
        if (target.extraMatch && Object.entries(target.extraMatch).some(([key, value]) => docItem.data[key] !== value)) {
          continue;
        }
        await patchDocument(toRelativePath(docItem.name), {
          [target.field]: newUserId,
        });
        counters.relatedDocsUpdated += 1;
      }
    }

    await deleteDocument(oldPath);
    counters.studentDocsRekeyed += 1;
  }

  console.log('\nMigration summary:');
  console.log(`- users updated: ${counters.usersUpdated}`);
  console.log(`- students updated: ${counters.studentsUpdated}`);
  console.log(`- parent users backfilled: ${counters.parentUsersUpdated}`);
  console.log(`- student docs rekeyed: ${counters.studentDocsRekeyed}`);
  console.log(`- related docs updated: ${counters.relatedDocsUpdated}`);
  console.log(`- warnings: ${counters.warnings}`);
  console.log(`- student/user ID mismatches detected: ${counters.studentIdMismatches}`);
  console.log(isCommitMode ? '\nMigration complete.' : '\nDry-run complete. Re-run with --commit to apply changes.');
}

migrate().catch((error) => {
  console.error('\nMigration failed.');
  console.error(error);
  process.exit(1);
});
