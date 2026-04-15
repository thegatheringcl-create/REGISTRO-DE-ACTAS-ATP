import React, { useState, useContext, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { ASESORES, ESTABLECIMIENTOS, TIPOS_CONTACTO, MOTIVOS, ESTAMENTOS, ESTADOS_ACUERDO } from '../constants';
import { Plus, Trash2, Upload, FileText, Loader2, X } from 'lucide-react';
import { UserContext } from '../App';
import { extractVisitFromPDF } from '../lib/gemini';

export type Acuerdo = {
  id: string;
  descripcion: string;
  plazo: string;
  responsables: string;
  fechaRevision: string;
  estado: string;
};

export type Participante = {
  id: string;
  nombre: string;
  cargo: string;
};

type FormData = {
  asesor: string;
  fecha: string;
  establecimiento: string;
  tipoContacto: string;
  motivo: string;
  motivoOtro?: string;
  estamento: string;
  estamentoOtro?: string;
  descripcion: string;
  anexos?: string;
};

export default function NewVisitForm({ visitaToEdit, onCancelEdit }: { visitaToEdit?: any, onCancelEdit?: () => void }) {
  const { userProfile } = useContext(UserContext);
  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>();
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [uploadMode, setUploadMode] = useState<'manual' | 'auto'>('manual');
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [acuerdosSostenedor, setAcuerdosSostenedor] = useState<Acuerdo[]>([]);
  const [acuerdosEquipo, setAcuerdosEquipo] = useState<Acuerdo[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);

  useEffect(() => {
    if (visitaToEdit) {
      setValue('asesor', visitaToEdit.asesor);
      
      if (visitaToEdit.fecha?.toDate) {
        const d = visitaToEdit.fecha.toDate();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setValue('fecha', dateStr);
      } else if (typeof visitaToEdit.fecha === 'string') {
        setValue('fecha', visitaToEdit.fecha);
      }
      
      setValue('establecimiento', visitaToEdit.establecimiento);
      setValue('tipoContacto', visitaToEdit.tipoContacto);
      setValue('motivo', visitaToEdit.motivo);
      if (visitaToEdit.motivoOtro) setValue('motivoOtro', visitaToEdit.motivoOtro);
      setValue('estamento', visitaToEdit.estamento);
      if (visitaToEdit.estamentoOtro) setValue('estamentoOtro', visitaToEdit.estamentoOtro);
      setValue('descripcion', visitaToEdit.descripcion);
      if (visitaToEdit.anexos) setValue('anexos', visitaToEdit.anexos);
      
      setAcuerdosSostenedor(visitaToEdit.acuerdosSostenedor || []);
      setAcuerdosEquipo(visitaToEdit.acuerdosEquipo || []);
      setParticipantes(visitaToEdit.participantes || []);
    } else if (userProfile?.role === 'asesor' && userProfile.asesorName) {
      setValue('asesor', userProfile.asesorName);
    }
  }, [visitaToEdit, userProfile, setValue]);

  const watchMotivo = watch('motivo');
  const watchEstamento = watch('estamento');

  const addParticipante = () => {
    setParticipantes([...participantes, { id: crypto.randomUUID(), nombre: '', cargo: '' }]);
  };

  const updateParticipante = (id: string, field: keyof Participante, value: string) => {
    setParticipantes(participantes.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeParticipante = (id: string) => {
    setParticipantes(participantes.filter(p => p.id !== id));
  };

  const addAcuerdo = (tipo: 'sostenedor' | 'equipo') => {
    const newAcuerdo: Acuerdo = {
      id: crypto.randomUUID(),
      descripcion: '',
      plazo: '',
      responsables: '',
      fechaRevision: '',
      estado: 'Registrado'
    };
    if (tipo === 'sostenedor') {
      setAcuerdosSostenedor([...acuerdosSostenedor, newAcuerdo]);
    } else {
      setAcuerdosEquipo([...acuerdosEquipo, newAcuerdo]);
    }
  };

  const updateAcuerdo = (tipo: 'sostenedor' | 'equipo', id: string, field: keyof Acuerdo, value: string) => {
    if (tipo === 'sostenedor') {
      setAcuerdosSostenedor(acuerdosSostenedor.map(a => a.id === id ? { ...a, [field]: value } : a));
    } else {
      setAcuerdosEquipo(acuerdosEquipo.map(a => a.id === id ? { ...a, [field]: value } : a));
    }
  };

  const removeAcuerdo = (tipo: 'sostenedor' | 'equipo', id: string) => {
    if (tipo === 'sostenedor') {
      setAcuerdosSostenedor(acuerdosSostenedor.filter(a => a.id !== id));
    } else {
      setAcuerdosEquipo(acuerdosEquipo.filter(a => a.id !== id));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setErrorMessage('Por favor, sube un archivo PDF válido.');
      return;
    }

    setIsExtracting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64String = (event.target?.result as string).split(',')[1];
          const extractedData = await extractVisitFromPDF(base64String);
          
          // Populate form fields
          if (extractedData.establecimiento) setValue('establecimiento', extractedData.establecimiento);
          if (extractedData.fecha) setValue('fecha', extractedData.fecha);
          if (extractedData.tipoContacto) setValue('tipoContacto', extractedData.tipoContacto);
          if (extractedData.motivo) setValue('motivo', extractedData.motivo);
          if (extractedData.motivoOtro) setValue('motivoOtro', extractedData.motivoOtro);
          if (extractedData.estamento) setValue('estamento', extractedData.estamento);
          if (extractedData.estamentoOtro) setValue('estamentoOtro', extractedData.estamentoOtro);
          if (extractedData.descripcion) setValue('descripcion', extractedData.descripcion);
          if (extractedData.anexos) setValue('anexos', extractedData.anexos);

          // Populate arrays
          if (extractedData.participantes) {
            setParticipantes(extractedData.participantes.map((p: any) => ({ ...p, id: crypto.randomUUID() })));
          }
          if (extractedData.acuerdosSostenedor) {
            setAcuerdosSostenedor(extractedData.acuerdosSostenedor.map((a: any) => ({ ...a, id: crypto.randomUUID(), estado: 'Registrado' })));
          }
          if (extractedData.acuerdosEquipo) {
            setAcuerdosEquipo(extractedData.acuerdosEquipo.map((a: any) => ({ ...a, id: crypto.randomUUID(), estado: 'Registrado' })));
          }

          setSuccessMessage('Información extraída exitosamente. Por favor, revisa y completa los datos antes de guardar.');
          setUploadMode('manual'); // Switch back to manual mode to review
        } catch (err) {
          console.error(err);
          setErrorMessage('Error al procesar el PDF con IA. Asegúrate de que el documento sea legible.');
        } finally {
          setIsExtracting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setErrorMessage('Error al leer el archivo.');
      setIsExtracting(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSuccessMessage('');
    setErrorMessage('');
    
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Debes iniciar sesión para registrar una visita.");

      // Convert date string to Date object
      const fechaParts = data.fecha.split('-');
      const fechaDate = new Date(parseInt(fechaParts[0]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[2]));

      const visitaData: any = {
        asesor: data.asesor,
        fecha: fechaDate,
        establecimiento: data.establecimiento,
        tipoContacto: data.tipoContacto,
        motivo: data.motivo,
        estamento: data.estamento,
        descripcion: data.descripcion,
        updatedAt: serverTimestamp()
      };

      if (!visitaToEdit) {
        visitaData.createdAt = serverTimestamp();
        visitaData.authorUid = user.uid;
      }

      if (data.motivo === 'Otro' && data.motivoOtro) {
        visitaData.motivoOtro = data.motivoOtro;
      } else {
        visitaData.motivoOtro = null;
      }

      if (data.estamento === 'Otros' && data.estamentoOtro) {
        visitaData.estamentoOtro = data.estamentoOtro;
      } else {
        visitaData.estamentoOtro = null;
      }

      visitaData.acuerdosSostenedor = acuerdosSostenedor.length > 0 ? acuerdosSostenedor : [];
      visitaData.acuerdosEquipo = acuerdosEquipo.length > 0 ? acuerdosEquipo : [];
      visitaData.participantes = participantes.length > 0 ? participantes : [];
      visitaData.anexos = data.anexos || '';

      if (visitaToEdit) {
        await updateDoc(doc(db, 'visitas', visitaToEdit.id), visitaData);
        setSuccessMessage('Visita actualizada exitosamente.');
        if (onCancelEdit) {
          setTimeout(() => onCancelEdit(), 1500);
        }
      } else {
        await addDoc(collection(db, 'visitas'), visitaData);
        setSuccessMessage('Visita registrada exitosamente.');
        reset();
        setAcuerdosSostenedor([]);
        setAcuerdosEquipo([]);
        setParticipantes([]);
      }
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      setErrorMessage(`Error al ${visitaToEdit ? 'actualizar' : 'registrar'} la visita. Por favor, intenta de nuevo.`);
      try {
        handleFirestoreError(error, visitaToEdit ? OperationType.UPDATE : OperationType.CREATE, visitaToEdit ? `visitas/${visitaToEdit.id}` : 'visitas');
      } catch (e) {
        // Already logged
      }
    }
  };

  const renderAcuerdos = (tipo: 'sostenedor' | 'equipo', acuerdos: Acuerdo[]) => (
    <div className="space-y-4">
      {acuerdos.map((acuerdo) => (
        <div key={acuerdo.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 relative">
          <button
            type="button"
            onClick={() => removeAcuerdo(tipo, acuerdo.id)}
            className="absolute top-2 right-2 text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
            title="Eliminar acuerdo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de acuerdo / Descripción</label>
              <input
                type="text"
                value={acuerdo.descripcion}
                onChange={(e) => updateAcuerdo(tipo, acuerdo.id, 'descripcion', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Descripción del acuerdo..."
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plazo de ejecución</label>
              <input
                type="text"
                value={acuerdo.plazo}
                onChange={(e) => updateAcuerdo(tipo, acuerdo.id, 'plazo', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: 15 días, 30/05/2026..."
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Responsables</label>
              <input
                type="text"
                value={acuerdo.responsables}
                onChange={(e) => updateAcuerdo(tipo, acuerdo.id, 'responsables', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nombres o cargos..."
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de revisión</label>
              <input
                type="date"
                value={acuerdo.fechaRevision}
                onChange={(e) => updateAcuerdo(tipo, acuerdo.id, 'fechaRevision', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado inicial</label>
              <select
                value={acuerdo.estado}
                onChange={(e) => updateAcuerdo(tipo, acuerdo.id, 'estado', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {ESTADOS_ACUERDO.map(est => <option key={est} value={est}>{est}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => addAcuerdo(tipo)}
        className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        <Plus className="w-4 h-4 mr-1" />
        Agregar Acuerdo
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{visitaToEdit ? 'Editar Registro de Visita' : 'Nuevo Registro de Visita'}</h2>
          <p className="text-sm text-gray-500 mt-1">{visitaToEdit ? 'Modifica los datos del acompañamiento técnico.' : 'Completa los datos para registrar un acompañamiento técnico.'}</p>
        </div>
        {visitaToEdit && (
          <button
            onClick={onCancelEdit}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Cancelar edición"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>
        
        {/* Mode Toggle */}
        <div className="mt-6 flex space-x-4">
          <button
            onClick={() => setUploadMode('manual')}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              uploadMode === 'manual' 
                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <FileText className="w-4 h-4 mr-2" />
            Ingreso Manual
          </button>
          <button
            onClick={() => setUploadMode('auto')}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              uploadMode === 'auto' 
                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Upload className="w-4 h-4 mr-2" />
            Carga Automática (PDF)
          </button>
        </div>

      {uploadMode === 'auto' && (
        <div className="p-6 border-b border-gray-200 bg-blue-50/50">
          <div className="max-w-xl">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Sube un acta o informe en PDF</h3>
            <p className="text-sm text-gray-500 mb-4">
              Nuestra Inteligencia Artificial analizará el documento y extraerá automáticamente la información para rellenar el formulario. Podrás revisar y editar los datos antes de guardar.
            </p>
            
            <div className="flex items-center justify-center w-full">
              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer ${isExtracting ? 'border-blue-400 bg-blue-100' : 'border-gray-300 bg-white hover:bg-gray-50'}`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                      <p className="text-sm text-blue-600 font-medium">Analizando documento con IA...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Haz clic para subir</span> o arrastra y suelta</p>
                      <p className="text-xs text-gray-500">Solo archivos PDF (Max. 10MB)</p>
                    </>
                  )}
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={isExtracting}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className={`p-6 space-y-6 ${isExtracting ? 'opacity-50 pointer-events-none' : ''}`}>
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            {successMessage}
          </div>
        )}
        
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Asesor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asesor</label>
            {userProfile?.role === 'asesor' && userProfile.asesorName ? (
              <div className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {userProfile.asesorName}
                <input type="hidden" {...register('asesor')} value={userProfile.asesorName} />
              </div>
            ) : (
              <select 
                {...register('asesor', { required: 'Este campo es requerido' })}
                className={`w-full rounded-md border ${errors.asesor ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
              >
                <option value="">Seleccione un asesor...</option>
                {ASESORES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            {errors.asesor && <p className="mt-1 text-xs text-red-600">{errors.asesor.message}</p>}
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input 
              type="date"
              {...register('fecha', { required: 'Este campo es requerido' })}
              className={`w-full rounded-md border ${errors.fecha ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
            />
            {errors.fecha && <p className="mt-1 text-xs text-red-600">{errors.fecha.message}</p>}
          </div>

          {/* Establecimiento */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Establecimiento</label>
            <select 
              {...register('establecimiento', { required: 'Este campo es requerido' })}
              className={`w-full rounded-md border ${errors.establecimiento ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
            >
              <option value="">Seleccione un establecimiento...</option>
              {ESTABLECIMIENTOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            {errors.establecimiento && <p className="mt-1 text-xs text-red-600">{errors.establecimiento.message}</p>}
          </div>

          {/* Tipo Contacto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Contacto</label>
            <select 
              {...register('tipoContacto', { required: 'Este campo es requerido' })}
              className={`w-full rounded-md border ${errors.tipoContacto ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
            >
              <option value="">Seleccione...</option>
              {TIPOS_CONTACTO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.tipoContacto && <p className="mt-1 text-xs text-red-600">{errors.tipoContacto.message}</p>}
          </div>

          {/* Estamento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estamento</label>
            <select 
              {...register('estamento', { required: 'Este campo es requerido' })}
              className={`w-full rounded-md border ${errors.estamento ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
            >
              <option value="">Seleccione...</option>
              {ESTAMENTOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            {errors.estamento && <p className="mt-1 text-xs text-red-600">{errors.estamento.message}</p>}
            {watchEstamento === 'Otros' && (
              <input
                type="text"
                {...register('estamentoOtro', { required: 'Por favor especifique el estamento' })}
                placeholder="Especifique el estamento..."
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent focus:ring-blue-500"
              />
            )}
            {errors.estamentoOtro && <p className="mt-1 text-xs text-red-600">{errors.estamentoOtro.message}</p>}
          </div>

          {/* Motivo */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de Acompañamiento</label>
            <select 
              {...register('motivo', { required: 'Este campo es requerido' })}
              className={`w-full rounded-md border ${errors.motivo ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
            >
              <option value="">Seleccione...</option>
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {errors.motivo && <p className="mt-1 text-xs text-red-600">{errors.motivo.message}</p>}
            {watchMotivo === 'Otro' && (
              <input
                type="text"
                {...register('motivoOtro', { required: 'Por favor especifique el motivo' })}
                placeholder="Especifique el motivo..."
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent focus:ring-blue-500"
              />
            )}
            {errors.motivoOtro && <p className="mt-1 text-xs text-red-600">{errors.motivoOtro.message}</p>}
          </div>

          {/* Descripción */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea 
              {...register('descripcion', { required: 'Este campo es requerido' })}
              rows={4}
              className={`w-full rounded-md border ${errors.descripcion ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent`}
              placeholder="Breve descripción de la visita..."
            />
            {errors.descripcion && <p className="mt-1 text-xs text-red-600">{errors.descripcion.message}</p>}
          </div>

          {/* Participantes */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Actores involucrados en la reunión</label>
            <div className="space-y-4">
              {participantes.map((participante) => (
                <div key={participante.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 relative">
                  <button
                    type="button"
                    onClick={() => removeParticipante(participante.id)}
                    className="absolute top-2 right-2 text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                    title="Eliminar actor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={participante.nombre}
                        onChange={(e) => updateParticipante(participante.id, 'nombre', e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Nombre completo..."
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cargo</label>
                      <input
                        type="text"
                        value={participante.cargo}
                        onChange={(e) => updateParticipante(participante.id, 'cargo', e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Cargo..."
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addParticipante}
                className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar Actor
              </button>
            </div>
          </div>

          {/* Acuerdos Sostenedor */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Acuerdos, tareas y/o compromisos del sostenedor o su representante</label>
            {renderAcuerdos('sostenedor', acuerdosSostenedor)}
          </div>

          {/* Acuerdos Equipo */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Acuerdos, tareas y/o compromisos del Equipo Directivo, técnico u otro</label>
            {renderAcuerdos('equipo', acuerdosEquipo)}
          </div>

          {/* Anexos */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Listado de anexos o adjuntos al acta</label>
            <textarea 
              {...register('anexos')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent focus:ring-blue-500"
              placeholder="Liste documentos anexos o adjuntos..."
            />
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 flex justify-end space-x-3">
          {visitaToEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || isExtracting}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Guardando...' : (visitaToEdit ? 'Actualizar Visita' : 'Registrar Visita')}
          </button>
        </div>
      </form>
    </div>
  );
}
