import React, { useState, useEffect, useContext, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, Legend } from 'recharts';
import { ESTADOS_ACUERDO } from '../constants';
import { X, Download, Filter, FileText, Printer, Edit, Trash2 } from 'lucide-react';
import { UserContext } from '../App';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type Acuerdo = {
  id: string;
  descripcion: string;
  plazo: string;
  responsables: string;
  fechaRevision: string;
  estado: string;
};

type Participante = {
  id: string;
  nombre: string;
  cargo: string;
};

type Visita = {
  id: string;
  asesor: string;
  fecha: any;
  establecimiento: string;
  tipoContacto: string;
  motivo: string;
  motivoOtro?: string;
  estamento: string;
  estamentoOtro?: string;
  descripcion: string;
  acuerdosSostenedor?: Acuerdo[];
  acuerdosEquipo?: Acuerdo[];
  participantes?: Participante[];
  anexos?: string;
  authorUid?: string;
};

export default function Dashboard({ onEditVisita }: { onEditVisita: (visita: Visita) => void }) {
  const { userProfile } = useContext(UserContext);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisita, setSelectedVisita] = useState<Visita | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Filter states
  const [filterAsesor, setFilterAsesor] = useState('');
  const [filterEstablecimiento, setFilterEstablecimiento] = useState('');
  const [filterMes, setFilterMes] = useState('');

  useEffect(() => {
    if (!userProfile) return;

    let q;
    if (userProfile.role === 'admin') {
      q = query(collection(db, 'visitas'), orderBy('createdAt', 'desc'));
    } else {
      // Filter by authorUid directly in the query for non-admins
      q = query(
        collection(db, 'visitas'), 
        where('authorUid', '==', userProfile.uid),
        orderBy('createdAt', 'desc')
      );
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data: Visita[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Visita);
      });

      // Filter client-side if not admin
      if (userProfile.role !== 'admin') {
        data = data.filter(v => v.authorUid === userProfile.uid);
      }

      setVisitas(data);
      
      // Update selected visita if it's currently open
      if (selectedVisita) {
        const updated = data.find(v => v.id === selectedVisita.id);
        if (updated) setSelectedVisita(updated);
      }
      
      setLoading(false);
    }, (error) => {
      console.error("Error fetching visitas", error);
      handleFirestoreError(error, OperationType.LIST, 'visitas');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedVisita, userProfile]);

  const handleUpdateAcuerdoEstado = async (visitaId: string, tipo: 'sostenedor' | 'equipo', acuerdoId: string, newEstado: string) => {
    const visita = visitas.find(v => v.id === visitaId);
    if (!visita) return;

    try {
      const field = tipo === 'sostenedor' ? 'acuerdosSostenedor' : 'acuerdosEquipo';
      const acuerdos = visita[field] || [];
      const updatedAcuerdos = acuerdos.map(a => a.id === acuerdoId ? { ...a, estado: newEstado } : a);

      await updateDoc(doc(db, 'visitas', visitaId), {
        [field]: updatedAcuerdos
      });
    } catch (error) {
      console.error("Error updating acuerdo", error);
      handleFirestoreError(error, OperationType.UPDATE, `visitas/${visitaId}`);
    }
  };

  const handleDeleteVisita = async (visitaId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'visitas', visitaId));
      if (selectedVisita?.id === visitaId) {
        setSelectedVisita(null);
      }
    } catch (error) {
      console.error("Error deleting visita", error);
      handleFirestoreError(error, OperationType.DELETE, `visitas/${visitaId}`);
    }
  };

  // --- FILTER LOGIC ---
  const uniqueAsesores = Array.from(new Set(visitas.map(v => v.asesor))).filter(Boolean).sort();
  const uniqueEstablecimientos = Array.from(new Set(visitas.map(v => v.establecimiento))).filter(Boolean).sort();
  const uniqueMeses = Array.from(new Set(visitas.map(v => {
    if (!v.fecha?.toDate) return '';
    const d = v.fecha.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))).filter(Boolean).sort().reverse();

  const filteredVisitas = visitas.filter(v => {
    if (filterAsesor && v.asesor !== filterAsesor) return false;
    if (filterEstablecimiento && v.establecimiento !== filterEstablecimiento) return false;
    if (filterMes) {
      if (!v.fecha?.toDate) return false;
      const d = v.fecha.toDate();
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (mStr !== filterMes) return false;
    }
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Establecimiento', 'Asesor', 'Modalidad', 'Motivo', 'Estamento', 'Descripción'];
    const rows = filteredVisitas.map(v => [
      v.fecha?.toDate ? v.fecha.toDate().toLocaleDateString() : '',
      `"${v.establecimiento}"`,
      `"${v.asesor}"`,
      v.tipoContacto,
      `"${v.motivo === 'Otro' ? v.motivoOtro : v.motivo}"`,
      `"${v.estamento === 'Otros' ? v.estamentoOtro : v.estamento}"`,
      `"${v.descripcion.replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `visitas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    
    setIsExporting(true);
    try {
      const element = dashboardRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        backgroundColor: '#f9fafb' // Match gray-50
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // If content is longer than one page, we might need to split it, 
      // but for a dashboard summary, one long page or a scaled single page is often preferred.
      // Here we'll just add it to the first page.
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`resumen_visitas_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
      alert("Hubo un error al generar el PDF. Por favor, intenta de nuevo.");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><p className="text-gray-500">Cargando datos...</p></div>;
  }

  if (visitas.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Resumen General</h2>
        <p className="text-gray-500">Aún no hay registros de visitas.</p>
      </div>
    );
  }

  // Calculate stats based on FILTERED visitas
  const totalVisitas = filteredVisitas.length;
  
  const byTipoContacto = filteredVisitas.reduce((acc, v) => {
    acc[v.tipoContacto] = (acc[v.tipoContacto] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byMotivo = filteredVisitas.reduce((acc, v) => {
    acc[v.motivo] = (acc[v.motivo] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byEstamento = filteredVisitas.reduce((acc, v) => {
    acc[v.estamento] = (acc[v.estamento] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byEscuela = filteredVisitas.reduce((acc, v) => {
    acc[v.establecimiento] = (acc[v.establecimiento] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byAsesor = filteredVisitas.reduce((acc, v) => {
    acc[v.asesor] = (acc[v.asesor] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byMes = filteredVisitas.reduce((acc, v) => {
    if(v.fecha?.toDate) {
      const d = v.fecha.toDate();
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      acc[mStr] = (acc[mStr] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Prepare chart data
  const chartDataMotivo = Object.entries(byMotivo).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number));
  const chartDataEstamento = Object.entries(byEstamento).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number));
  const chartDataEscuela = Object.entries(byEscuela).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number)).slice(0, 10); // Top 10
  const chartDataAsesor = Object.entries(byAsesor).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number));
  const chartDataMes = Object.entries(byMes).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  const chartDataTipo = Object.entries(byTipoContacto).map(([name, value]) => ({ name, value }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  const PIE_COLORS = ['#10b981', '#8b5cf6']; // Green for Presencial, Purple for Online

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 no-print">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900">Filtros de Información</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {userProfile?.role === 'admin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asesor</label>
              <select
                value={filterAsesor}
                onChange={(e) => setFilterAsesor(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los asesores</option>
                {uniqueAsesores.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Establecimiento</label>
            <select
              value={filterEstablecimiento}
              onChange={(e) => setFilterEstablecimiento(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los establecimientos</option>
              {uniqueEstablecimientos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
            <select
              value={filterMes}
              onChange={(e) => setFilterMes(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los meses</option>
              {uniqueMeses.map(m => {
                const [year, month] = (m as string).split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1);
                const monthName = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
                return <option key={m as string} value={m as string}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6 no-print">
          <h2 className="text-xl font-semibold text-gray-900">Gráficos y Estadísticas</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-4 rounded-lg transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className={`flex items-center space-x-2 text-sm bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FileText className="w-4 h-4" />
              <span>{isExporting ? 'Generando...' : 'Exportar PDF'}</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>
        
        <div ref={dashboardRef} className="print:p-0">
          {/* Report Header (Visible only in PDF/Print) */}
          <div className={`${isExporting ? 'block' : 'hidden'} print:block mb-8 border-b pb-4`}>
            <h1 className="text-2xl font-bold text-gray-900">Reporte de Visitas de Acompañamiento Técnico</h1>
            <p className="text-sm text-gray-500 mt-1">Generado el: {new Date().toLocaleString()}</p>
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div><span className="font-semibold">Asesor:</span> {filterAsesor || 'Todos'}</div>
              <div><span className="font-semibold">Establecimiento:</span> {filterEstablecimiento || 'Todos'}</div>
              <div><span className="font-semibold">Mes:</span> {filterMes || 'Todos'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-sm font-medium text-blue-600 mb-1">Total de Visitas</p>
            <p className="text-3xl font-bold text-blue-900">{totalVisitas}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <p className="text-sm font-medium text-green-600 mb-1">Presencial</p>
            <p className="text-3xl font-bold text-green-900">{byTipoContacto['Presencial'] || 0}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
            <p className="text-sm font-medium text-purple-600 mb-1">Online</p>
            <p className="text-3xl font-bold text-purple-900">{byTipoContacto['Online'] || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Evolución por Mes */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-4 text-center">Evolución de Visitas por Mes</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={chartDataMes} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{fontSize: 12}} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" name="Visitas" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tipo de Contacto Pie */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-4 text-center">Distribución por Modalidad</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={chartDataTipo}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {chartDataTipo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Motivos Chart */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-4 text-center">Principales Temas Abordados (Motivos)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartDataMotivo} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                  <Tooltip />
                  <Bar dataKey="value" name="Visitas" radius={[0, 4, 4, 0]}>
                    {chartDataMotivo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Estamentos Chart */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-4 text-center">Estamentos Visitados</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartDataEstamento} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                  <Tooltip />
                  <Bar dataKey="value" name="Visitas" radius={[0, 4, 4, 0]}>
                    {chartDataEstamento.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Escuelas Chart */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-4 text-center">Top 10 Escuelas Visitadas</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartDataEscuela} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 10}} />
                  <Tooltip />
                  <Bar dataKey="value" name="Visitas" radius={[0, 4, 4, 0]} fill="#06b6d4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Asesores Chart (Only relevant if admin or multiple asesores) */}
          {userProfile?.role === 'admin' && (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-4 text-center">Visitas por Asesor</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={chartDataAsesor} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 11}} />
                    <Tooltip />
                    <Bar dataKey="value" name="Visitas" radius={[0, 4, 4, 0]} fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Recent Visits Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Últimos Registros (Filtrados)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Establecimiento</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asesor</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modalidad</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVisitas.slice(0, 10).map((visita) => (
                <tr key={visita.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {visita.fecha?.toDate ? visita.fecha.toDate().toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {visita.establecimiento}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {visita.asesor}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {visita.motivo === 'Otro' ? visita.motivoOtro : visita.motivo}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      visita.tipoContacto === 'Presencial' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {visita.tipoContacto}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => setSelectedVisita(visita)}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        Ver
                      </button>
                      {userProfile?.role === 'admin' && (
                        <>
                          <button
                            onClick={() => onEditVisita(visita)}
                            className="text-amber-600 hover:text-amber-900"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteVisita(visita.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVisitas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    No hay registros que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visita Details Modal */}
      {selectedVisita && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-xl z-10">
              <div className="flex items-center space-x-4">
                <h3 className="text-xl font-semibold text-gray-900">Detalles de la Visita</h3>
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1 px-2 rounded no-print"
                >
                  <Printer className="w-3 h-3" />
                  <span>Imprimir Acta</span>
                </button>
                {userProfile?.role === 'admin' && (
                  <div className="flex items-center space-x-2 no-print">
                    <button
                      onClick={() => onEditVisita(selectedVisita)}
                      className="flex items-center space-x-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 py-1 px-2 rounded"
                    >
                      <Edit className="w-3 h-3" />
                      <span>Editar</span>
                    </button>
                    <button
                      onClick={() => handleDeleteVisita(selectedVisita.id)}
                      className="flex items-center space-x-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 py-1 px-2 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedVisita(null)}
                className="text-gray-400 hover:text-gray-500 transition-colors no-print"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <p className="text-sm font-medium text-gray-500">Establecimiento</p>
                  <p className="mt-1 text-base text-gray-900">{selectedVisita.establecimiento}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Fecha</p>
                  <p className="mt-1 text-base text-gray-900">{selectedVisita.fecha?.toDate ? selectedVisita.fecha.toDate().toLocaleDateString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Asesor</p>
                  <p className="mt-1 text-base text-gray-900">{selectedVisita.asesor}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Modalidad</p>
                  <p className="mt-1 text-base text-gray-900">{selectedVisita.tipoContacto}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Motivo</p>
                  <p className="mt-1 text-base text-gray-900">{selectedVisita.motivo === 'Otro' ? selectedVisita.motivoOtro : selectedVisita.motivo}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Estamento</p>
                  <p className="mt-1 text-base text-gray-900">{selectedVisita.estamento === 'Otros' ? selectedVisita.estamentoOtro : selectedVisita.estamento}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-gray-500">Descripción</p>
                  <p className="mt-1 text-base text-gray-900 whitespace-pre-wrap">{selectedVisita.descripcion}</p>
                </div>
              </div>

              {/* Participantes */}
              <div className="mb-8">
                <h4 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">Actores involucrados en la reunión</h4>
                {selectedVisita.participantes && selectedVisita.participantes.length > 0 ? (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedVisita.participantes.map(p => (
                          <tr key={p.id}>
                            <td className="px-4 py-2 text-sm text-gray-900">{p.nombre}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{p.cargo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No hay actores registrados.</p>
                )}
              </div>

              {/* Acuerdos Sostenedor */}
              <div className="mb-8">
                <h4 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">Acuerdos del Sostenedor</h4>
                {selectedVisita.acuerdosSostenedor && selectedVisita.acuerdosSostenedor.length > 0 ? (
                  <div className="space-y-4">
                    {selectedVisita.acuerdosSostenedor.map((acuerdo) => (
                      <div key={acuerdo.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <p className="text-sm font-medium text-gray-500">Descripción</p>
                            <p className="text-sm text-gray-900">{acuerdo.descripcion}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Plazo</p>
                            <p className="text-sm text-gray-900">{acuerdo.plazo}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Responsables</p>
                            <p className="text-sm text-gray-900">{acuerdo.responsables}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Fecha Revisión</p>
                            <p className="text-sm text-gray-900">{acuerdo.fechaRevision}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">Estado</p>
                            <select
                              value={acuerdo.estado}
                              onChange={(e) => handleUpdateAcuerdoEstado(selectedVisita.id, 'sostenedor', acuerdo.id, e.target.value)}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                            >
                              {ESTADOS_ACUERDO.map(est => <option key={est} value={est}>{est}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No hay acuerdos registrados.</p>
                )}
              </div>

              {/* Acuerdos Equipo */}
              <div className="mb-8">
                <h4 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">Acuerdos del Equipo Directivo</h4>
                {selectedVisita.acuerdosEquipo && selectedVisita.acuerdosEquipo.length > 0 ? (
                  <div className="space-y-4">
                    {selectedVisita.acuerdosEquipo.map((acuerdo) => (
                      <div key={acuerdo.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <p className="text-sm font-medium text-gray-500">Descripción</p>
                            <p className="text-sm text-gray-900">{acuerdo.descripcion}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Plazo</p>
                            <p className="text-sm text-gray-900">{acuerdo.plazo}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Responsables</p>
                            <p className="text-sm text-gray-900">{acuerdo.responsables}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Fecha Revisión</p>
                            <p className="text-sm text-gray-900">{acuerdo.fechaRevision}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">Estado</p>
                            <select
                              value={acuerdo.estado}
                              onChange={(e) => handleUpdateAcuerdoEstado(selectedVisita.id, 'equipo', acuerdo.id, e.target.value)}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                            >
                              {ESTADOS_ACUERDO.map(est => <option key={est} value={est}>{est}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No hay acuerdos registrados.</p>
                )}
              </div>

              {selectedVisita.anexos && (
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2 border-b pb-2">Anexos</h4>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedVisita.anexos}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
