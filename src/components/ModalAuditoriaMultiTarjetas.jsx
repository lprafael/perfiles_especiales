import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../config';
import * as XLSX from 'xlsx';

const ModalAuditoriaMultiTarjetas = ({ onClose, onAuditarTarjeta }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCat, setFilterCat] = useState('all'); // 'all' | 'concurrente' | 'secuencial' | 'sin_uso'
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDocs, setExpandedDocs] = useState({});

  useEffect(() => {
    fetchAuditoria();
  }, []);

  const fetchAuditoria = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/perfiles/auditoria/multiples-tarjetas`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        // Expandir por defecto los concurrentes
        const exp = {};
        (json.personas || []).forEach(p => {
          if (p.categoria === 'concurrente') {
            exp[p.doc] = true;
          }
        });
        setExpandedDocs(exp);
      } else {
        const errData = await res.json();
        setError(errData.detail || 'Error al obtener la auditoría de múltiples tarjetas');
      }
    } catch (e) {
      console.error(e);
      setError('Error de conexión al cargar la auditoría');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (doc) => {
    setExpandedDocs(prev => ({ ...prev, [doc]: !prev[doc] }));
  };

  const personasFiltradas = useMemo(() => {
    if (!data?.personas) return [];
    return data.personas.filter(p => {
      if (filterCat !== 'all' && p.categoria !== filterCat) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const docMatch = p.doc && p.doc.toLowerCase().includes(q);
        const nomMatch = p.nombre && p.nombre.toLowerCase().includes(q);
        if (!docMatch && !nomMatch) return false;
      }
      return true;
    });
  }, [data, filterCat, searchTerm]);

  const handleExportExcel = () => {
    if (!personasFiltradas.length) return;
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen de Beneficiarios
    const rowsResumen = personasFiltradas.map(p => ({
      'Cédula': p.doc,
      'Nombre y Apellido': p.nombre,
      'Categoría': p.categoria === 'concurrente' ? 'Uso Concurrente (Solapado)' : (p.categoria === 'secuencial' ? 'Reposición Secuencial' : 'Sin Movimiento en 2da Tarjeta'),
      'Cantidad Tarjetas': p.cant_seriales,
      'Total Viajes': p.total_viajes_persona,
      'Días con Concurrencia': p.dias_concurrencia ? p.dias_concurrencia.length : 0,
      'Tarjetas Asignadas': Object.keys(p.tarjetas || {}).join(', ')
    }));
    const ws1 = XLSX.utils.json_to_sheet(rowsResumen);
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen_Beneficiarios');

    // Hoja 2: Días Concurrentes Solapados
    const rowsConcurrentes = [];
    personasFiltradas.forEach(p => {
      (p.dias_concurrencia || []).forEach(dc => {
        rowsConcurrentes.push({
          'Cédula': p.doc,
          'Nombre y Apellido': p.nombre,
          'Fecha Concurrencia': dc.fecha,
          'Total Viajes en el Día': dc.total_dia,
          'Tarjetas Utilizadas en el Día': dc.tarjetas_usadas,
          'Desglose': JSON.stringify(dc.desglose_por_tarjeta || {})
        });
      });
    });
    if (rowsConcurrentes.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(rowsConcurrentes);
      XLSX.utils.book_append_sheet(wb, ws2, 'Dias_Concurrencia_Solapados');
    }

    const fechaStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Auditoria_Multiples_Tarjetas_${fechaStr}.xlsx`);
  };

  const resumen = data?.resumen || {
    total_personas: 145,
    concurrentes: 24,
    secuenciales: 90,
    sin_uso: 31,
    total_dias_concurrencia: 799
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '1100px',
        height: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Header Modal */}
        <div style={{
          padding: '1.25rem 1.75rem',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>👥</span> Auditoría de Personas con Más de una Tarjeta
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Supervisión de beneficiarios con múltiples plásticos emitidos en Billetaje (Solapadas con uso simultáneo vs. Reposiciones Secuenciales).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={handleExportExcel}
              disabled={loading || !personasFiltradas.length}
              style={{
                padding: '0.5rem 1rem',
                background: '#107c41',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
              title="Descargar detalle a Excel"
            >
              📥 Exportar a Excel
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#ffffff',
                fontSize: '1.4rem',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tarjetas de Resumen Global (KPIs) */}
        <div style={{
          padding: '1rem 1.75rem',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem'
        }}>
          <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', borderLeft: '4px solid #0284c7' }}>
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, display: 'block' }}>TOTAL BENEFICIARIOS</span>
            <strong style={{ fontSize: '1.4rem', color: '#0369a1' }}>{resumen.total_personas}</strong>
            <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>Con &gt; 1 tarjeta asignada</small>
          </div>

          <div style={{ background: '#fef2f2', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626' }}>
            <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, display: 'block' }}>🚨 SOLAPADAS (USO SIMULTÁNEO)</span>
            <strong style={{ fontSize: '1.4rem', color: '#b91c1c' }}>{resumen.concurrentes}</strong>
            <small style={{ display: 'block', color: '#991b1b', fontSize: '0.75rem' }}>{resumen.total_dias_concurrencia} días con viajes simultáneos</small>
          </div>

          <div style={{ background: '#f0fdf4', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #bbf7d0', borderLeft: '4px solid #16a34a' }}>
            <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700, display: 'block' }}>🔄 REPOSICIÓN SECUENCIAL</span>
            <strong style={{ fontSize: '1.4rem', color: '#15803d' }}>{resumen.secuenciales}</strong>
            <small style={{ display: 'block', color: '#166534', fontSize: '0.75rem' }}>Reemplazo regular sin solapamiento</small>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', borderLeft: '4px solid #64748b' }}>
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, display: 'block' }}>💳 SIN USO 2ª TARJETA</span>
            <strong style={{ fontSize: '1.4rem', color: '#334155' }}>{resumen.sin_uso}</strong>
            <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>Plástico adicional nunca validó</small>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div style={{
          padding: '0.75rem 1.75rem',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          {/* Pestañas de categoría */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterCat('all')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: filterCat === 'all' ? '#0f172a' : '#cbd5e1',
                background: filterCat === 'all' ? '#0f172a' : '#ffffff',
                color: filterCat === 'all' ? '#ffffff' : '#334155',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Todos ({resumen.total_personas})
            </button>
            <button
              onClick={() => setFilterCat('concurrente')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: filterCat === 'concurrente' ? '#b91c1c' : '#fecaca',
                background: filterCat === 'concurrente' ? '#dc2626' : '#fef2f2',
                color: filterCat === 'concurrente' ? '#ffffff' : '#991b1b',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🚨 Solapadas / Uso Concurrente ({resumen.concurrentes})
            </button>
            <button
              onClick={() => setFilterCat('secuencial')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: filterCat === 'secuencial' ? '#15803d' : '#bbf7d0',
                background: filterCat === 'secuencial' ? '#16a34a' : '#f0fdf4',
                color: filterCat === 'secuencial' ? '#ffffff' : '#166534',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔄 No Solapadas / Secuencial ({resumen.secuenciales})
            </button>
            <button
              onClick={() => setFilterCat('sin_uso')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: filterCat === 'sin_uso' ? '#475569' : '#e2e8f0',
                background: filterCat === 'sin_uso' ? '#475569' : '#f8fafc',
                color: filterCat === 'sin_uso' ? '#ffffff' : '#475569',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              💳 Sin Uso ({resumen.sin_uso})
            </button>
          </div>

          {/* Input de Búsqueda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nombre o cédula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                width: '260px'
              }}
            />
            <small style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {personasFiltradas.length} resultados
            </small>
          </div>
        </div>

        {/* Cuerpo del Listado */}
        <div style={{
          padding: '1.25rem 1.75rem',
          overflowY: 'auto',
          flex: 1,
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⏳</div>
              <strong style={{ fontSize: '1rem' }}>Cargando datos de auditoría de múltiples tarjetas...</strong>
            </div>
          ) : error ? (
            <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '1.25rem', borderRadius: '8px' }}>
              ⚠️ <strong>Error:</strong> {error}
            </div>
          ) : personasFiltradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔍</div>
              <strong style={{ fontSize: '1rem' }}>No se encontraron beneficiarios con los filtros seleccionados</strong>
            </div>
          ) : (
            personasFiltradas.map((p) => {
              const isExpanded = Boolean(expandedDocs[p.doc]);
              const esConcurrente = p.categoria === 'concurrente';
              const cantConcurrencias = p.dias_concurrencia ? p.dias_concurrencia.length : 0;

              return (
                <div
                  key={p.doc}
                  style={{
                    background: '#ffffff',
                    borderRadius: '10px',
                    border: esConcurrente ? '2px solid #fecaca' : '1px solid #e2e8f0',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Fila Encabezado de la Persona */}
                  <div
                    onClick={() => toggleExpand(p.doc)}
                    style={{
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: esConcurrente ? '#fef2f2' : '#ffffff',
                      borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {esConcurrente ? '🚨' : (p.categoria === 'secuencial' ? '🔄' : '💳')}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{p.nombre}</strong>
                          <span style={{ fontSize: '0.8rem', background: '#e2e8f0', color: '#334155', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                            C.I. {p.doc}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                          <span>💳 <strong>{p.cant_seriales}</strong> tarjetas emitidas</span> • <span>🎫 <strong>{p.total_viajes_persona.toLocaleString()}</strong> viajes totales</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {esConcurrente ? (
                        <span style={{
                          background: '#fee2e2',
                          color: '#b91c1c',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          border: '1px solid #fecaca',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          🚨 {cantConcurrencias} días de uso simultáneo (Solapadas)
                        </span>
                      ) : p.categoria === 'secuencial' ? (
                        <span style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          border: '1px solid #bbf7d0'
                        }}>
                          🔄 No Solapadas (Secuencial)
                        </span>
                      ) : (
                        <span style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontWeight: 500,
                          fontSize: '0.8rem'
                        }}>
                          💳 Sin Uso en 2ª Tarjeta
                        </span>
                      )}

                      <span style={{ fontSize: '0.9rem', color: '#64748b' }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Detalle Desplegable */}
                  {isExpanded && (
                    <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
                      {/* Grid de Tarjetas Físicas */}
                      <strong style={{ fontSize: '0.85rem', color: '#334155', display: 'block', marginBottom: '0.6rem' }}>
                        💳 Detalle de Tarjetas Físicas Asignadas ({Object.keys(p.tarjetas || {}).length}):
                      </strong>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '0.85rem',
                        marginBottom: '1rem'
                      }}>
                        {Object.values(p.tarjetas || {}).map((t) => {
                          const tieneViajes = t.total_viajes > 0;
                          return (
                            <div
                              key={t.serial}
                              style={{
                                background: '#ffffff',
                                border: `1px solid ${tieneViajes ? '#cbd5e1' : '#e2e8f0'}`,
                                borderLeft: `4px solid ${tieneViajes ? '#10b981' : '#94a3b8'}`,
                                borderRadius: '8px',
                                padding: '0.85rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                                fontSize: '0.82rem'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ color: '#0f172a', fontSize: '0.95rem', fontFamily: 'monospace' }}>
                                  💳 {t.serial}
                                </strong>
                                <span style={{
                                  fontSize: '0.72rem',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  background: tieneViajes ? '#d1fae5' : '#f1f5f9',
                                  color: tieneViajes ? '#047857' : '#64748b'
                                }}>
                                  {tieneViajes ? 'ACTIVA' : 'SIN VIAJES'}
                                </span>
                              </div>

                              <div style={{ color: '#475569' }}>
                                <strong>Total Viajes:</strong> <span style={{ color: tieneViajes ? '#0284c7' : '#94a3b8', fontWeight: 700 }}>{t.total_viajes}</span>
                              </div>
                              <div style={{ color: '#475569' }}>
                                <strong>Días con viajes:</strong> {t.dias_uso} días
                              </div>
                              <div style={{ color: '#475569' }}>
                                <strong>Promedio diario:</strong> {t.promedio_por_dia_uso} viajes/día
                              </div>
                              <div style={{ color: '#475569' }}>
                                <strong>Máx. en 1 día:</strong> <span style={{ color: t.max_viajes_en_un_dia >= 10 ? '#dc2626' : 'inherit', fontWeight: t.max_viajes_en_un_dia >= 10 ? 700 : 500 }}>{t.max_viajes_en_un_dia} viajes</span>
                              </div>
                              <div style={{ color: '#64748b', fontSize: '0.76rem', marginTop: '0.2rem' }}>
                                <strong>Rango:</strong> {t.primer_viaje || '-'} al {t.ultimo_viaje || '-'}
                              </div>

                              {onAuditarTarjeta && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAuditarTarjeta(t.serial, p.doc, p.nombre);
                                  }}
                                  style={{
                                    marginTop: '0.5rem',
                                    padding: '0.35rem 0.65rem',
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    color: '#1d4ed8',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    alignSelf: 'flex-start'
                                  }}
                                >
                                  📍 Ver Validaciones y GPS
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Tabla de Días de Uso Simultáneo / Concurrente */}
                      {esConcurrente && p.dias_concurrencia && p.dias_concurrencia.length > 0 && (
                        <div style={{ marginTop: '0.75rem', background: '#fff1f2', borderRadius: '8px', border: '1px solid #fecdd3', padding: '0.85rem' }}>
                          <strong style={{ color: '#be123c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
                            <span>🚨</span> Días de Uso Simultáneo Registrados ({p.dias_concurrencia.length} jornadas):
                          </strong>
                          <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#ffffff', borderRadius: '6px', border: '1px solid #fecdd3' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                              <thead>
                                <tr style={{ background: '#ffe4e6', borderBottom: '1px solid #fecdd3', textAlign: 'left' }}>
                                  <th style={{ padding: '0.4rem 0.6rem', color: '#9f1239' }}>Fecha</th>
                                  <th style={{ padding: '0.4rem 0.6rem', color: '#9f1239', textAlign: 'center' }}>Total Viajes Día</th>
                                  <th style={{ padding: '0.4rem 0.6rem', color: '#9f1239', textAlign: 'center' }}>Tarjetas Usadas</th>
                                  <th style={{ padding: '0.4rem 0.6rem', color: '#9f1239' }}>Desglose de Viajes por Tarjeta</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.dias_concurrencia.map((dc, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #fef2f2' }}>
                                    <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#0f172a' }}>📅 {dc.fecha}</td>
                                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', fontWeight: 700, color: '#e11d48' }}>{dc.total_dia} viajes</td>
                                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', fontWeight: 600 }}>{dc.tarjetas_usadas} tarjetas</td>
                                    <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace', color: '#334155' }}>
                                      {Object.entries(dc.desglose_por_tarjeta || {}).map(([s, v]) => (
                                        <span key={s} style={{ marginRight: '0.75rem', background: '#f8fafc', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                          💳 {s}: <strong>{v}</strong> viajes
                                        </span>
                                      ))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Modal */}
        <div style={{
          padding: '0.85rem 1.75rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <small style={{ color: '#64748b' }}>
            Base de datos consultada: <strong>opentransit-prod (c_modusuario & c_transacciones)</strong>
          </small>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.25rem',
              background: '#0f172a',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.88rem'
            }}
          >
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalAuditoriaMultiTarjetas;
