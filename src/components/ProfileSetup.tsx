import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../App';
import { ASESORES } from '../constants';
import { ClipboardList } from 'lucide-react';

export default function ProfileSetup({ userProfile, onComplete }: { userProfile: UserProfile, onComplete: (p: UserProfile) => void }) {
  const [role, setRole] = useState<'admin' | 'asesor' | ''>('');
  const [asesorName, setAsesorName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!role) return;
    if (role === 'asesor' && !asesorName) return;

    setSaving(true);
    try {
      const updated = {
        role,
        asesorName: role === 'asesor' ? asesorName : '',
        isSetupComplete: true
      };
      await updateDoc(doc(db, 'users', userProfile.uid), updated);
      onComplete({ ...userProfile, ...updated } as UserProfile);
    } catch (error) {
      console.error(error);
      alert("Error al guardar el perfil. Por favor intenta de nuevo.");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <ClipboardList className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Menú de Ingreso</h2>
        <p className="text-gray-500 mb-6 text-center">Selecciona tu perfil para continuar</p>
        
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Perfil</label>
            <select 
              value={role} 
              onChange={(e) => {
                setRole(e.target.value as any);
                if (e.target.value !== 'asesor') setAsesorName('');
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Seleccione un perfil...</option>
              <option value="asesor">Asesor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          {role === 'asesor' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Asesor</label>
              <select 
                value={asesorName} 
                onChange={(e) => setAsesorName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione su nombre...</option>
                {ASESORES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !role || (role === 'asesor' && !asesorName)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Ingresando...' : 'Ingresar a la plataforma'}
        </button>
      </div>
    </div>
  );
}
