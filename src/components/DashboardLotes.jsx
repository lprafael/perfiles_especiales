import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config';
import './DashboardLotes.css';

const DashboardLotes = ({ user }) => {
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      total_lotes: 0,
      lotes_remitidos: 0,
      lotes_parciales: 0,
      lotes_pendientes: 0,
      total_perfiles: 0,
      remitidos_eps: 0,
      pendientes_remision: 0,
      rechazados: 0,
      porcentaje_remitido: 0
    },
    resumen_tipos: [],
    lotes: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros de Lotes
  const [filterRemision, setFilterRemision] = useState('all'); // 'all' | 'REMITIDO' | 'PENDIENTE' | 'PARCIAL'
  const [selectedTipoFilter, setSelectedTipoFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Estado del Modal de Detalle de Lote
  const [modalLote, setModalLote] = useState(null);
  const [modalBeneficiarios, setModalBeneficiarios] = useState([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/perfiles/dashboard_lotes`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || 'Error al obtener datos del dashboard');
      }
    } catch (err) {
      console.error(err);
      setError('Error de conexión al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Filtrado de Lotes en memoria
  const filteredLotes = useMemo(() => {
    return dashboardData.lotes.filter((l) => {
      // Filtro por Estado de Remisión e Impresión
      if (filterRemision === 'CON_PENDIENTES_IMPRESION') {
        if (!l.en_impresion_eps || l.en_impresion_eps <= 0) return false;
      } else if (filterRemision === 'EMITIDO_TOTAL') {
        if (!l.remitidos_eps || l.remitidos_eps <= 0 || (l.en_impresion_eps && l.en_impresion_eps > 0)) return false;
      } else if (filterRemision !== 'all' && l.estado_remision !== filterRemision) {
        return false;
      }
      // Filtro por Tipo de Perfil
      if (selectedTipoFilter !== 'all' && String(l.id_tipo_perfil) !== String(selectedTipoFilter)) {
        return false;
      }
      // Filtro por Búsqueda de Texto
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const loteNom = (l.lote || '').toLowerCase();
        const tipoNom = (l.tipo_perfil || '').toLowerCase();
        const orgNom = (l.organismo_sigla || '').toLowerCase();
        const epsNom = (l.eps_destinos || '').toLowerCase();
        if (!loteNom.includes(term) && !tipoNom.includes(term) && !orgNom.includes(term) && !epsNom.includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [dashboardData.lotes, filterRemision, selectedTipoFilter, searchTerm]);

  // Abrir Modal de Beneficiarios de un Lote
  const handleOpenModal = async (loteItem) => {
    setModalLote(loteItem);
    setLoadingModal(true);
    setModalBeneficiarios([]);
    setModalSearch('');

    try {
      const url = new URL(`${API_BASE}/perfiles/`);
      url.searchParams.append('lote', loteItem.lote);
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setModalBeneficiarios(data);
      } else {
        alert('No se pudieron cargar los beneficiarios del lote');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al obtener beneficiarios');
    } finally {
      setLoadingModal(false);
    }
  };

  const handleCloseModal = () => {
    setModalLote(null);
    setModalBeneficiarios([]);
    setModalSearch('');
  };

  // Beneficiarios filtrados en el Modal
  const filteredModalBeneficiarios = useMemo(() => {
    if (!modalSearch.trim()) return modalBeneficiarios;
    const term = modalSearch.toLowerCase();
    return modalBeneficiarios.filter((p) => {
      const ci = (p.cedula_identidad || '').toLowerCase();
      const nom = (p.nombre_apellido || '').toLowerCase();
      const serial = (p.serial_mdp || '').toLowerCase();
      return ci.includes(term) || nom.includes(term) || serial.includes(term);
    });
  }, [modalBeneficiarios, modalSearch]);

  // Exportar Dashboard completo a Excel
  const handleExportExcel = () => {
    if (!dashboardData.resumen_tipos.length && !dashboardData.lotes.length) {
      alert('No hay datos para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen por Tipo de Perfil
    const resumenRows = dashboardData.resumen_tipos.map((rt) => ({
      'Tipo de Perfil': rt.tipo_perfil,
      'Organismo': rt.organismo_sigla || 'N/A',
      'Lotes Solicitados': rt.total_lotes,
      'Lotes Remitidos a EPS': rt.lotes_remitidos,
      'Lotes Parciales': rt.lotes_parciales,
      'Lotes Pendientes': rt.lotes_pendientes,
      'Total Perfiles Solicitados': rt.total_perfiles,
      'Remitidos a EPS': rt.remitidos_eps,
      'Tarjetas Impresas (Serial)': rt.emitidos_tarjeta || 0,
      'Aún No Impresas': rt.en_impresion_eps || 0,
      'Entregados': rt.entregados || 0,
      'Pendientes de Remisión': rt.pendientes_remision,
      'Rechazados': rt.rechazados,
      '% Remitido a EPS': `${rt.porcentaje_remitido}%`
    }));
    const wsResumen = XLSX.utils.json_to_sheet(resumenRows);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen_Por_Tipo');

    // Hoja 2: Detalle de Control por Lote
    const lotesRows = dashboardData.lotes.map((l) => ({
      'Lote': l.lote,
      'Tipo de Perfil': l.tipo_perfil,
      'Organismo': l.organismo_sigla || 'N/A',
      'Estado Remisión': l.estado_remision,
      '% Remitido': `${l.porcentaje_remitido}%`,
      'Total Perfiles': l.total_perfiles,
      'Remitidos a EPS': l.remitidos_eps,
      'Emitidos con Tarjeta (Serial)': l.emitidos_tarjeta || 0,
      'En Impresión en EPS': l.en_impresion_eps || 0,
      'Entregados': l.entregados || 0,
      'Aprobados (Listos EPS)': l.aprobados,
      'Verificados': l.verificados,
      'Solicitados (Nuevos)': l.solicitados,
      'Rechazados': l.rechazados,
      'EPS Asignada': l.eps_destinos,
      'Fecha Solicitud Inicial': l.fecha_solicitud ? new Date(l.fecha_solicitud).toLocaleDateString() : '',
      'Fecha Remisión a EPS': l.fecha_ultima_remision ? new Date(l.fecha_ultima_remision).toLocaleDateString() : '',
      'Fecha Emisión Tarjeta': l.fecha_ultima_emision ? new Date(l.fecha_ultima_emision).toLocaleDateString() : '',
      'Fecha Entrega': l.fecha_ultima_entrega ? new Date(l.fecha_ultima_entrega).toLocaleDateString() : ''
    }));
    const wsLotes = XLSX.utils.json_to_sheet(lotesRows);
    XLSX.utils.book_append_sheet(wb, wsLotes, 'Control_De_Lotes');

    const fechaStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Control_Lotes_EPS_${fechaStr}.xlsx`);
  };

  // Exportar Beneficiarios del Modal a Excel
  const handleExportModalBeneficiarios = () => {
    if (!modalBeneficiarios.length) return;
    const rows = modalBeneficiarios.map((p) => ({
      'Cédula': p.cedula_identidad || '',
      'Nombre y Apellido': p.nombre_apellido || '',
      'Lote': p.Lote || '',
      'Estado': p.estado_solicitud?.descripcion || (p.id_estado_solicitud === 7 ? 'Entregado' : (p.id_estado_solicitud === 6 ? 'Remitido a EPS' : (p.id_estado_solicitud === 5 ? 'Emitido' : `Estado ${p.id_estado_solicitud}`))),
      'EPS Destino': p.eps || 'Sin Asignar',
      'Serial MDP': p.serial_mdp || '',
      'Fecha Solicitud': p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleDateString() : '',
      'Fecha Remisión EPS': p.fecha_remision_eps ? new Date(p.fecha_remision_eps).toLocaleDateString() : '',
      'Fecha Emisión Tarjeta': p.fecha_emision ? new Date(p.fecha_emision).toLocaleDateString() : '',
      'Fecha Entrega': p.fecha_entrega ? new Date(p.fecha_entrega).toLocaleDateString() : '',
      'Entregado A': p.entregado_a || ''
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Beneficiarios');
    const loteClean = (modalLote?.lote || 'Lote').replace(/[/\\?%*:|"<>]/g, '_');
    XLSX.writeFile(wb, `Beneficiarios_${loteClean}.xlsx`);
  };

  const { kpis, resumen_tipos } = dashboardData;

  return (
    <div className="db-container">
      {/* Header Principal */}
      <div className="db-header">
        <div className="db-header-left">
          <h2>📊 Dashboard: Control de Lotes y Remisión a EPS</h2>
          <p>
            Supervisión del estado de lotes remitidos y pendientes a las Empresas Prestadoras de Servicio (TDP / EPAS).
          </p>
        </div>
        <div className="db-header-actions">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="db-btn db-btn-refresh"
            title="Refrescar información"
          >
            🔄 {loading ? 'Actualizando...' : 'Refrescar Datos'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="db-btn db-btn-excel"
            title="Descargar reporte completo en formato Excel"
          >
            📥 Exportar a Excel
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '1rem', borderRadius: '8px' }}>
          ⚠️ <strong>Aviso:</strong> {error}
        </div>
      )}

      {/* Tarjetas KPIs Globales */}
      <div className="db-kpis-grid">
        <div className="db-kpi-card blue">
          <div className="db-kpi-top">
            <span className="db-kpi-title">Total Lotes</span>
            <span className="db-kpi-icon">📦</span>
          </div>
          <div className="db-kpi-value">{kpis.total_lotes.toLocaleString()}</div>
          <div className="db-kpi-subtext">
            <span>{kpis.lotes_remitidos} remitidos a EPS</span> • <span>{kpis.lotes_pendientes + kpis.lotes_parciales} pendientes/parciales</span>
          </div>
        </div>

        <div className="db-kpi-card purple">
          <div className="db-kpi-top">
            <span className="db-kpi-title">Total Solicitudes</span>
            <span className="db-kpi-icon">👥</span>
          </div>
          <div className="db-kpi-value">{kpis.total_perfiles.toLocaleString()}</div>
          <div className="db-kpi-subtext">
            Beneficiarios importados en el sistema
          </div>
        </div>

        <div className="db-kpi-card blue">
          <div className="db-kpi-top">
            <span className="db-kpi-title">Solicitados a EPS</span>
            <span className="db-kpi-icon">📨</span>
          </div>
          <div className="db-kpi-value">{kpis.remitidos_eps.toLocaleString()}</div>
          <div className="db-kpi-subtext">
            <strong>{kpis.porcentaje_remitido}%</strong> de beneficiarios válidos
          </div>
        </div>

        <div className="db-kpi-card amber" style={{ borderLeftColor: '#f59e0b', background: '#fffdfa' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-title" style={{ color: '#b45309' }}>Aún No Impresas en EPS</span>
            <span className="db-kpi-icon">🖨️</span>
          </div>
          <div className="db-kpi-value" style={{ color: '#b45309' }}>{(kpis.en_impresion_eps || 0).toLocaleString()}</div>
          <div className="db-kpi-subtext">
            Remitidos en espera de tarjeta y serial
          </div>
        </div>

        <div className="db-kpi-card green" style={{ borderLeftColor: '#16a34a', background: '#f8fdf9' }}>
          <div className="db-kpi-top">
            <span className="db-kpi-title" style={{ color: '#15803d' }}>Tarjetas Impresas</span>
            <span className="db-kpi-icon">💳</span>
          </div>
          <div className="db-kpi-value" style={{ color: '#15803d' }}>{(kpis.emitidos_tarjeta || 0).toLocaleString()}</div>
          <div className="db-kpi-subtext">
            <span><strong>{kpis.porcentaje_impreso || 0}%</strong> con Serial MDP</span>
            {kpis.entregados > 0 && <span> • <strong>{kpis.entregados.toLocaleString()}</strong> entregadas 🎁</span>}
          </div>
        </div>

        <div className="db-kpi-card red">
          <div className="db-kpi-top">
            <span className="db-kpi-title">Pend. Remisión / Rechazados</span>
            <span className="db-kpi-icon">⏳</span>
          </div>
          <div className="db-kpi-value" style={{ fontSize: '1.6rem' }}>
            {kpis.pendientes_remision.toLocaleString()} <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>/ {kpis.rechazados} rech.</span>
          </div>
          <div className="db-kpi-subtext">
            En trámite interno antes de EPS
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: Resumen por Tipo de Perfil */}
      <div className="db-section">
        <div className="db-section-header">
          <div>
            <div className="db-section-title">
              <h3>🏷️ Resumen por Tipo de Perfil Especial</h3>
              <span className="badge-count">{resumen_tipos.length} Tipos</span>
            </div>
            <p className="db-section-subtitle">
              Métricas consolidadas de lotes y beneficiarios solicitados vs. remitidos a las EPS por cada categoría.
            </p>
          </div>
          {selectedTipoFilter !== 'all' && (
            <button
              onClick={() => setSelectedTipoFilter('all')}
              style={{ background: '#e2e8f0', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
            >
              ✖ Quitar filtro de tipo ({resumen_tipos.find(t => String(t.id_tipo_perfil) === String(selectedTipoFilter))?.tipo_perfil || 'Filtro'})
            </button>
          )}
        </div>

        <div className="db-tipos-grid">
          {resumen_tipos.map((tp) => {
            const isSelected = String(selectedTipoFilter) === String(tp.id_tipo_perfil);
            return (
              <div
                key={tp.id_tipo_perfil ?? 'sin_tipo'}
                className={`db-tipo-card ${isSelected ? 'active-filter' : ''}`}
                onClick={() => setSelectedTipoFilter(isSelected ? 'all' : String(tp.id_tipo_perfil))}
                style={{ cursor: 'pointer' }}
                title="Haga clic para filtrar los lotes correspondientes en la tabla inferior"
              >
                <div className="db-tipo-header">
                  <div>
                    <h4 className="db-tipo-name">{tp.tipo_perfil}</h4>
                    {tp.organismo_sigla && (
                      <span className="db-tipo-org">🏛️ {tp.organismo_sigla}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isSelected ? '#1e40af' : '#64748b' }}>
                    {isSelected ? '✓ Filtrado' : 'Filtrar'}
                  </span>
                </div>

                <div className="db-tipo-stats">
                  <div className="db-stat-item">
                    <span className="db-stat-label">Lotes Solicitados</span>
                    <span className="db-stat-num">{tp.total_lotes}</span>
                    <small style={{ color: '#64748b', fontSize: '0.7rem' }}>
                      ({tp.lotes_remitidos} remit. / {tp.lotes_pendientes + tp.lotes_parciales} pend.)
                    </small>
                  </div>
                  <div className="db-stat-item">
                    <span className="db-stat-label">Perfiles Solicitados</span>
                    <span className="db-stat-num">{tp.total_perfiles.toLocaleString()}</span>
                  </div>
                  <div className="db-stat-item">
                    <span className="db-stat-label">Remitidos a EPS</span>
                    <span className="db-stat-num blue">{tp.remitidos_eps.toLocaleString()}</span>
                  </div>
                  <div className="db-stat-item">
                    <span className="db-stat-label">🖨️ Aún No Impresas</span>
                    <span className="db-stat-num amber" style={{ color: '#b45309' }}>{(tp.en_impresion_eps || 0).toLocaleString()}</span>
                  </div>
                  <div className="db-stat-item">
                    <span className="db-stat-label">💳 Impresas con Serial</span>
                    <span className="db-stat-num green">{(tp.emitidos_tarjeta || 0).toLocaleString()}</span>
                    {tp.entregados > 0 && (
                      <small style={{ color: '#047857', display: 'block', fontSize: '0.7rem', fontWeight: 600 }}>
                        ({tp.entregados} entregadas 🎁)
                      </small>
                    )}
                  </div>
                  <div className="db-stat-item">
                    <span className="db-stat-label">Pendientes Remisión</span>
                    <span className="db-stat-num" style={{ color: '#64748b' }}>{tp.pendientes_remision.toLocaleString()}</span>
                  </div>
                </div>

                <div className="db-progress-wrap">
                  <div className="db-progress-labels">
                    <span>Avance de Remisión a EPS</span>
                    <span style={{ color: '#15803d' }}>{tp.porcentaje_remitido}%</span>
                  </div>
                  <div className="db-progress-bar-bg">
                    <div
                      className="db-progress-bar-fill green"
                      style={{ width: `${Math.min(tp.porcentaje_remitido, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECCIÓN 2: Control Detallado de Lotes */}
      <div className="db-section">
        <div className="db-section-header">
          <div>
            <div className="db-section-title">
              <h3>📋 Control Detallado de Lotes (Remisión a EPS)</h3>
              <span className="badge-count">{filteredLotes.length} de {dashboardData.lotes.length} Lotes</span>
            </div>
            <p className="db-section-subtitle">
              Identifique rápidamente cuáles lotes ya fueron remitidos en su totalidad a las EPS y cuáles aún permanecen pendientes o parciales.
            </p>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="db-filters-bar">
          <div className="db-pills-group">
            <button
              onClick={() => setFilterRemision('all')}
              className={`db-pill ${filterRemision === 'all' ? 'active' : ''}`}
            >
              Todos los Lotes
              <span className="db-pill-count">{dashboardData.lotes.length}</span>
            </button>
            <button
              onClick={() => setFilterRemision('REMITIDO')}
              className={`db-pill pill-green ${filterRemision === 'REMITIDO' ? 'active' : ''}`}
            >
              ✅ Remitidos a EPS
              <span className="db-pill-count">{kpis.lotes_remitidos}</span>
            </button>
            <button
              onClick={() => setFilterRemision('PENDIENTE')}
              className={`db-pill pill-amber ${filterRemision === 'PENDIENTE' ? 'active' : ''}`}
            >
              ⏳ Pendientes
              <span className="db-pill-count">{kpis.lotes_pendientes}</span>
            </button>
            <button
              onClick={() => setFilterRemision('PARCIAL')}
              className={`db-pill pill-blue ${filterRemision === 'PARCIAL' ? 'active' : ''}`}
            >
              🔄 Parciales
              <span className="db-pill-count">{kpis.lotes_parciales}</span>
            </button>
            <button
              onClick={() => setFilterRemision('CON_PENDIENTES_IMPRESION')}
              className={`db-pill ${filterRemision === 'CON_PENDIENTES_IMPRESION' ? 'active' : ''}`}
              style={{
                borderColor: filterRemision === 'CON_PENDIENTES_IMPRESION' ? '#d97706' : undefined,
                background: filterRemision === 'CON_PENDIENTES_IMPRESION' ? '#fffbeb' : undefined,
                color: filterRemision === 'CON_PENDIENTES_IMPRESION' ? '#b45309' : undefined
              }}
            >
              🖨️ Pendientes de Impresión
              <span className="db-pill-count" style={{ background: '#fef3c7', color: '#92400e' }}>
                {dashboardData.lotes.filter(l => (l.en_impresion_eps || 0) > 0).length}
              </span>
            </button>
          </div>

          <div className="db-inputs-group">
            <select
              value={selectedTipoFilter}
              onChange={(e) => setSelectedTipoFilter(e.target.value)}
              className="db-select"
            >
              <option value="all">Todos los Tipos de Perfil</option>
              {resumen_tipos.map((t) => (
                <option key={t.id_tipo_perfil ?? 'sin_tipo'} value={String(t.id_tipo_perfil)}>
                  {t.tipo_perfil}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="🔍 Buscar por lote, organismo, EPS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="db-search"
            />
          </div>
        </div>

        {/* Tabla de Lotes */}
        <div className="db-table-wrapper">
          <table className="db-table">
            <thead>
              <tr>
                <th>Nombre del Lote</th>
                <th>Tipo de Perfil</th>
                <th style={{ textAlign: 'center' }}>Total Perfiles</th>
                <th style={{ textAlign: 'center' }}>Estado Remisión</th>
                <th style={{ width: '130px' }}>Avance Remisión</th>
                <th>Desglose por Estado</th>
                <th>EPS Destino</th>
                <th>Última Emisión</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredLotes.length === 0 ? (
                <tr>
                  <td colSpan="9" className="db-empty-state">
                    <h4>No se encontraron lotes con los filtros aplicados</h4>
                    <p>Pruebe seleccionando "Todos los Lotes" o limpiando el texto de búsqueda.</p>
                  </td>
                </tr>
              ) : (
                filteredLotes.map((lote) => {
                  let badgeClass = 'pendiente';
                  let badgeText = '⏳ Pendiente';
                  if (lote.estado_remision === 'REMITIDO') {
                    badgeClass = 'remitido';
                    badgeText = '✅ Remitido a EPS';
                  } else if (lote.estado_remision === 'PARCIAL') {
                    badgeClass = 'parcial';
                    badgeText = '🔄 Parcial';
                  }

                  return (
                    <tr key={`${lote.lote}_${lote.id_tipo_perfil}`}>
                      <td>
                        <strong className="db-badge-lote">
                          📦 {lote.lote}
                        </strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{lote.tipo_perfil}</div>
                        {lote.organismo_sigla && (
                          <small style={{ color: '#64748b' }}>🏛️ {lote.organismo_sigla}</small>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}>
                        {lote.total_perfiles.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`db-badge ${badgeClass}`}>
                          {badgeText}
                        </span>
                      </td>
                      <td>
                        <div className="db-progress-wrap">
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: lote.porcentaje_remitido === 100 ? '#15803d' : '#334155' }}>
                            {lote.porcentaje_remitido}% ({lote.remitidos_eps}/{lote.total_perfiles - lote.rechazados})
                          </span>
                          <div className="db-progress-bar-bg" style={{ height: '6px' }}>
                            <div
                              className={`db-progress-bar-fill ${lote.porcentaje_remitido === 100 ? 'green' : 'blue'}`}
                              style={{ width: `${Math.min(lote.porcentaje_remitido, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }} title="Remitidos a EPS">
                            Remitidos: {lote.remitidos_eps}
                          </span>
                          {lote.entregados > 0 && (
                            <span style={{ background: '#ecfdf5', color: '#047857', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }} title="Tarjetas entregadas al titular o institución">
                              🎁 Entregados: {lote.entregados}
                            </span>
                          )}
                          {lote.aprobados > 0 && (
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }} title="Aprobados listos para emitir">
                              Aprobados: {lote.aprobados}
                            </span>
                          )}
                          {lote.verificados > 0 && (
                            <span style={{ background: '#fef3c7', color: '#b45309', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }} title="Verificados pendientes de aprobación">
                              Verificados: {lote.verificados}
                            </span>
                          )}
                          {lote.solicitados > 0 && (
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }} title="Solicitados sin verificar">
                              Nuevos: {lote.solicitados}
                            </span>
                          )}
                          {lote.rechazados > 0 && (
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }} title="Rechazados">
                              Rechazados: {lote.rechazados}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {lote.eps_destinos && lote.eps_destinos !== 'Sin Asignar' ? (
                          <span className="db-badge-eps">
                            🏢 {lote.eps_destinos}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Pendiente</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {lote.fecha_ultima_remision ? (
                          <span title="Fecha de remisión por correo a la EPS">📨 {new Date(lote.fecha_ultima_remision).toLocaleDateString()}</span>
                        ) : lote.fecha_solicitud ? (
                          <span title="Fecha de solicitud inicial">Sol: {new Date(lote.fecha_solicitud).toLocaleDateString()}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenModal(lote)}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                          title="Inspeccionar beneficiarios de este lote"
                        >
                          👁️ Ver Perfiles
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Beneficiarios del Lote */}
      {modalLote && (
        <div className="db-modal-overlay" onClick={handleCloseModal}>
          <div className="db-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="db-modal-header">
              <div>
                <h3>📦 Beneficiarios del Lote: {modalLote.lote}</h3>
                <small style={{ color: '#64748b' }}>
                  {modalLote.tipo_perfil} • Total: {modalLote.total_perfiles} perfiles ({modalLote.remitidos_eps} remitidos a EPS)
                </small>
              </div>
              <button onClick={handleCloseModal} className="db-modal-close" title="Cerrar modal">
                ✖
              </button>
            </div>

            <div className="db-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por cédula, nombre o serial..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="db-search"
                  style={{ minWidth: '260px' }}
                />
                <button
                  onClick={handleExportModalBeneficiarios}
                  disabled={!modalBeneficiarios.length}
                  className="db-btn db-btn-excel"
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                >
                  📥 Exportar Beneficiarios
                </button>
              </div>

              {loadingModal ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  ⏳ Cargando listado de beneficiarios del lote...
                </div>
              ) : (
                <div className="db-table-wrapper" style={{ maxHeight: '400px' }}>
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th>Cédula</th>
                        <th>Nombre y Apellido</th>
                        <th>Estado Solicitud</th>
                        <th>EPS Destino</th>
                        <th>Serial MDP</th>
                        <th>Fecha Remisión EPS</th>
                        <th>Fecha Emisión Tarjeta</th>
                        <th>Fecha Entrega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModalBeneficiarios.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                            No se encontraron registros de beneficiarios para este criterio.
                          </td>
                        </tr>
                      ) : (
                        filteredModalBeneficiarios.map((p) => (
                          <tr key={p.orden}>
                            <td style={{ fontWeight: 700 }}>{p.cedula_identidad}</td>
                            <td>{p.nombre_apellido}</td>
                            <td>
                              <span style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: p.id_estado_solicitud === 7 ? '#d1fae5' : (p.id_estado_solicitud === 5 ? '#dcfce7' : (p.id_estado_solicitud === 6 ? '#e0f2fe' : (p.id_estado_solicitud === 4 ? '#fee2e2' : '#fef3c7'))),
                                color: p.id_estado_solicitud === 7 ? '#047857' : (p.id_estado_solicitud === 5 ? '#15803d' : (p.id_estado_solicitud === 6 ? '#0369a1' : (p.id_estado_solicitud === 4 ? '#b91c1c' : '#b45309')))
                              }}>
                                {p.estado_solicitud?.descripcion || (p.id_estado_solicitud === 7 ? 'Entregado' : (p.id_estado_solicitud === 6 ? 'Remitido a EPS' : (p.id_estado_solicitud === 5 ? 'Emitido' : `Estado ${p.id_estado_solicitud}`)))}
                              </span>
                            </td>
                            <td>
                              {p.eps ? (
                                <span className="db-badge-eps">🏢 {p.eps}</span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sin Asignar</span>
                              )}
                            </td>
                            <td style={{ fontFamily: 'monospace', color: p.serial_mdp ? '#1e293b' : '#94a3b8' }}>
                              {p.serial_mdp || '-'}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                              {p.fecha_remision_eps ? new Date(p.fecha_remision_eps).toLocaleDateString() : '-'}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                              {p.fecha_emision ? new Date(p.fecha_emision).toLocaleDateString() : '-'}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                              {p.fecha_entrega ? (
                                <span title={p.entregado_a ? `Entregado a: ${p.entregado_a}` : 'Entregado'} style={{ color: '#047857', fontWeight: 600 }}>
                                  🎁 {new Date(p.fecha_entrega).toLocaleDateString()}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="db-modal-footer">
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Mostrando {filteredModalBeneficiarios.length} de {modalBeneficiarios.length} beneficiarios
              </span>
              <button
                onClick={handleCloseModal}
                style={{
                  background: '#334155',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLotes;

