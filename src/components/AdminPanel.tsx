import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../App';
import { Save, Check, UserPlus, Mail } from 'lucide-react';

export default function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [localUsers, setLocalUsers] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Quick assign states
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [quickRole, setQuickRole] = useState<'admin' | 'asesor' | ''>('');
  const [quickAsesor, setQuickAsesor] = useState<string>('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickSaved, setQuickSaved] = useState(false);

  // Registration states
  const [allowedUsers, setAllowedUsers] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'asesor' | ''>('');
  const [newAsesor, setNewAsesor] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const qAllowed = query(collection(db, 'allowed_users'));
    const unsubAllowed = onSnapshot(qAllowed, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ email: doc.id, ...doc.data() }));
      setAllowedUsers(data);
    });
    return () => unsubAllowed();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('email'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: UserProfile[] = [];
      snapshot.forEach((doc) => {
        data.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setUsers(data);
      
      setLocalUsers(prev => {
        const newLocal = { ...prev };
        data.forEach(u => {
          if (!newLocal[u.uid]) {
            newLocal[u.uid] = u;
          }
        });
        return newLocal;
      });
      
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLocalChange = (userId: string, field: keyof UserProfile, value: string) => {
    setLocalUsers(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value }
    }));
  };

  const handleSaveUser = async (userId: string) => {
    setSavingId(userId);
    try {
      const userToSave = localUsers[userId];
      await updateDoc(doc(db, 'users', userId), {
        role: userToSave.role,
        asesorName: userToSave.asesorName || ''
      });
      
      setSavedId(userId);
      setTimeout(() => setSavedId(null), 3000);
    } catch (error) {
      console.error("Error updating user:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
    setSavingId(null);
  };

  const hasChanges = (userId: string) => {
    const original = users.find(u => u.uid === userId);
    const local = localUsers[userId];
    if (!original || !local) return false;
    return original.role !== local.role || original.asesorName !== local.asesorName;
  };

  const handleUserSelect = (uid: string) => {
    setSelectedUserId(uid);
    const user = users.find(u => u.uid === uid);
    if (user) {
      setQuickRole(user.role);
      setQuickAsesor(user.asesorName || '');
    } else {
      setQuickRole('');
      setQuickAsesor('');
    }
  };

  const handleQuickSave = async () => {
    if (!selectedUserId) return;
    setQuickSaving(true);
    try {
      await updateDoc(doc(db, 'users', selectedUserId), {
        role: quickRole,
        asesorName: quickRole === 'asesor' ? quickAsesor : ''
      });
      setQuickSaved(true);
      setTimeout(() => setQuickSaved(false), 3000);
      
      setLocalUsers(prev => ({
        ...prev,
        [selectedUserId]: { ...prev[selectedUserId], role: quickRole as any, asesorName: quickRole === 'asesor' ? quickAsesor : '' }
      }));
    } catch (error) {
      console.error("Error updating user:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${selectedUserId}`);
    }
    setQuickSaving(false);
  };

  const handleRegisterUser = async () => {
    if (!newEmail || !newRole) return;
    if (newRole === 'asesor' && !newAsesor) return;
    
    setIsRegistering(true);
    try {
      const emailKey = newEmail.toLowerCase().trim();
      await setDoc(doc(db, 'allowed_users', emailKey), {
        role: newRole,
        asesorName: newRole === 'asesor' ? newAsesor : '',
        createdAt: new Date().toISOString()
      });
      setNewEmail('');
      setNewRole('');
      setNewAsesor('');
      alert("Usuario registrado exitosamente. Ya puede iniciar sesión.");
    } catch (error) {
      console.error("Error registering user:", error);
      handleFirestoreError(error, OperationType.CREATE, `allowed_users`);
    }
    setIsRegistering(false);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><p className="text-gray-500">Cargando usuarios...</p></div>;
  }

  const pendingUsers = allowedUsers.filter(au => !users.some(u => u.email.toLowerCase() === au.email.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Registration Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-blue-50">
          <h3 className="text-lg font-medium text-blue-900 flex items-center">
            <UserPlus className="w-5 h-5 mr-2" />
            Registrar Nuevo Usuario (Dar Acceso)
          </h3>
          <p className="text-sm text-blue-700 mt-1">Registra el correo de un usuario para permitirle el acceso a la plataforma.</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className="w-full rounded-md border border-gray-300 pl-10 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Seleccione rol --</option>
                <option value="asesor">Asesor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Asesor</label>
              <input
                type="text"
                value={newAsesor}
                onChange={(e) => setNewAsesor(e.target.value)}
                disabled={newRole !== 'asesor'}
                placeholder="Nombre completo..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>

            <div className="md:col-span-1">
              <button
                onClick={handleRegisterUser}
                disabled={!newEmail || !newRole || (newRole === 'asesor' && !newAsesor) || isRegistering}
                className="w-full flex justify-center items-center space-x-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isRegistering ? 'Registrando...' : 'Dar Acceso'}</span>
              </button>
            </div>
          </div>

          {pendingUsers.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Usuarios registrados pendientes de ingresar por primera vez:</h4>
              <div className="flex flex-wrap gap-2">
                {pendingUsers.map(pu => (
                  <span key={pu.email} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {pu.email} ({pu.role})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Assignment Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">Asignación Rápida de Roles</h3>
          <p className="text-sm text-gray-500 mt-1">Selecciona un usuario de la lista para asignarle un rol y un asesor rápidamente.</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">1. Seleccionar Usuario</label>
              <select
                value={selectedUserId}
                onChange={(e) => handleUserSelect(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Seleccione un usuario --</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.email} {u.displayName ? `(${u.displayName})` : ''}</option>
                ))}
              </select>
            </div>
            
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">2. Asignar Rol</label>
              <select
                value={quickRole}
                onChange={(e) => setQuickRole(e.target.value as any)}
                disabled={!selectedUserId}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="">-- Seleccione rol --</option>
                <option value="asesor">Asesor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">3. Nombre del Asesor</label>
              <input
                type="text"
                value={quickAsesor}
                onChange={(e) => setQuickAsesor(e.target.value)}
                disabled={!selectedUserId || quickRole !== 'asesor'}
                placeholder="Nombre completo..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>

            <div className="md:col-span-1">
              <button
                onClick={handleQuickSave}
                disabled={!selectedUserId || quickSaving}
                className={`w-full flex justify-center items-center space-x-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  quickSaved ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                } disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
              >
                {quickSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Guardado</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{quickSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 border border-blue-100 text-blue-800 rounded-lg text-sm flex items-start">
            <span className="mr-3 text-xl">💡</span>
            <p><strong>Nota importante:</strong> Los usuarios aparecerán en esta lista únicamente <strong>después</strong> de que hayan iniciado sesión en la plataforma por primera vez con su cuenta de Google.</p>
          </div>
        </div>
      </div>

      {/* Users Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Lista de Usuarios</h2>
          <p className="text-sm text-gray-500 mt-1">También puedes editar los roles directamente en la tabla inferior.</p>
        </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asesor Asignado</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => {
              const localUser = localUsers[user.uid] || user;
              const isDirty = hasChanges(user.uid);
              const isSaving = savingId === user.uid;
              const isSaved = savedId === user.uid;

              return (
                <tr key={user.uid} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">{user.displayName || 'Sin nombre'}</span>
                      <span className="text-sm text-gray-500">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={localUser.role}
                      onChange={(e) => handleLocalChange(user.uid, 'role', e.target.value)}
                      className={`rounded-md border ${isDirty && localUser.role !== user.role ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'} px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500`}
                    >
                      <option value="asesor">Asesor</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="text"
                      value={localUser.asesorName || ''}
                      onChange={(e) => handleLocalChange(user.uid, 'asesorName', e.target.value)}
                      disabled={localUser.role !== 'asesor'}
                      placeholder="Nombre del asesor..."
                      className={`w-full rounded-md border ${isDirty && localUser.asesorName !== user.asesorName ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'} px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50`}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleSaveUser(user.uid)}
                      disabled={!isDirty || isSaving}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        isSaved 
                          ? 'bg-green-100 text-green-700'
                          : isDirty 
                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Guardado</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
