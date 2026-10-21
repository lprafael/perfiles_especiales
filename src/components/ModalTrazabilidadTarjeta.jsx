import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' });
};

const ESTADOS_DISPONIBLES = [
  { id_estado: 1, descripcion: 'Solicitado', color: '#f39c12', icon: '📥', desc: 'Registro importado pendiente de verificación' },
  { id_estado: 2, descripcion: 'Verificado', color: '#3498db', icon: '🔍', desc: 'Verificado técnicamente, pendiente de aprobación' },
  { id_estado: 3, descripcion: 'Aprobado', color: '#27ae60', icon: '✅', desc: 'Aprobado formalmente, listo para remitir a EPS' },
  { id_estado: 4, descripcion: 'Rechazado', color: '#e74c3c', icon: '❌', desc: 'Tarjeta o perfil rechazado/anulado' },
  { id_estado: 5, descripcion: 'Emitido', color: '#8e44ad', icon: '💳', desc: 'Tarjeta emitida / remitida por correo a la EPS' },
];

const ModalTrazabilidadTarjeta = ({ perfil, onClose, onPerfilUpdated, isAdmin = false, initialTab = 'timeline' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [currentPerfil, setCurrentPerfil] = useState(perfil);

  // Estados para Cambio de Estado
  const [selectedNuevoEstado, setSelectedNuevoEstado] = useState(perfil.id_estado_solicitud || 1);
  const [motivoCambio, setMotivoCambio] = useState('');
  const [savingEstado, setSavingEstado] = useState(false);

  // Estados para Serial MDP
  const [serialMdpInput, setSerialMdpInput] = useState(perfil.serial_mdp || '');
  const [savingSerial, setSavingSerial] = useState(false);

  // Estados para Observaciones
  const [observacionesList, setObservacionesList] = useState(perfil.observaciones || []);
  const [loadingObs, setLoadingObs] = useState(false);
  const [newObsText, setNewObsText] = useState('');
  const [submittingObs, setSubmittingObs] = useState(false);

  // Cargar observaciones actualizadas al abrir
  useEffect(() => {
    const fetchObservaciones = async () => {
      setLoadingObs(true);
      try {
        const res = await fetch(`${API_BASE}/perfiles/${perfil.orden}/observaciones`, {
          headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setObservacionesList(data);
        }
      } catch (err) {
        console.error("Error cargando observaciones:", err);
      }
      setLoadingObs(false);
    };

    fetchObservaciones();
  }, [perfil.orden]);

  // Manejar cambio de estado
  const handleGuardarCambioEstado = async (e) => {
    e.preventDefault();
    if (selectedNuevoEstado === currentPerfil.id_estado_solicitud) {
      alert("Seleccione un estado diferente al actual.");
      return;
    }

    const estadoTarget = ESTADOS_DISPONIBLES.find(e => e.id_estado === Number(selectedNuevoEstado));
    const confirmMsg = `¿Está seguro de cambiar el estado de la tarjeta a '${estadoTarget ? estadoTarget.descripcion : selectedNuevoEstado}'?`;
    if (!window.confirm(confirmMsg)) return;

    setSavingEstado(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/${currentPerfil.orden}/estado`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          id_estado: Number(selectedNuevoEstado),
          motivo: motivoCambio.trim() || undefined
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setCurrentPerfil(updated);
        setMotivoCambio('');
        alert("Estado actualizado exitosamente con registro de auditoría.");
        if (onPerfilUpdated) onPerfilUpdated(updated);

        // Recargar observaciones para ver el registro automático del cambio
        const resObs = await fetch(`${API_BASE}/perfiles/${currentPerfil.orden}/observaciones`, {
          headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
        });
        if (resObs.ok) {
          const dataObs = await resObs.json();
          setObservacionesList(dataObs);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error al cambiar estado: ${err.detail || 'Ocurrió un error inesperado'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al actualizar el estado.");
    }
    setSavingEstado(false);
  };

  // Manejar guardado de Serial MDP
  const handleGuardarSerial = async (e) => {
    e.preventDefault();
    setSavingSerial(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/${currentPerfil.orden}/serial_mdp`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ serial_mdp: serialMdpInput.trim() })
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentPerfil(updated);
        alert("Serial MDP actualizado correctamente.");
        if (onPerfilUpdated) onPerfilUpdated(updated);
      } else {
        alert("Error al guardar el Serial MDP.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al guardar el Serial.");
    }
    setSavingSerial(false);
  };

  // Manejar nueva observación
  const handleAddObservacion = async (e) => {
    e.preventDefault();
    if (!newObsText.trim()) return;
    setSubmittingObs(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/${currentPerfil.orden}/observaciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ observacion: newObsText })
      });
      if (res.ok) {
        const createdObs = await res.json();
        const updatedList = [createdObs, ...observacionesList];
        setObservacionesList(updatedList);
        setNewObsText('');
        if (onPerfilUpdated) {
          onPerfilUpdated({
            ...currentPerfil,
            observaciones: updatedList
          });
        }
      } else {
        alert("Error al guardar observación");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
    setSubmittingObs(false);
  };

  // Manejar toggle atendido / resuelto
  const handleToggleObsStatus = async (obsId, field, currentValue) => {
    try {
      const res = await fetch(`${API_BASE}/perfiles/observaciones/${obsId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ [field]: !currentValue })
      });
      if (res.ok) {
        const updatedObs = await res.json();
        const updatedList = observacionesList.map(o => o.id_observacion === obsId ? updatedObs : o);
        setObservacionesList(updatedList);
        if (onPerfilUpdated) {
          onPerfilUpdated({
            ...currentPerfil,
            observaciones: updatedList
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const estadoActualInfo = ESTADOS_DISPONIBLES.find(e => e.id_estado === currentPerfil.id_estado_solicitud) || {
    descripcion: currentPerfil.estado_solicitud?.descripcion || 'Desconocido',
    color: '#64748b',
    icon: '🏷️'
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
        animation: 'fadeInModal 0.2s ease-out'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: '#1e293b',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🛡️</span>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                Ficha de Trazabilidad - Tarjeta #{currentPerfil.orden}
              </h3>
              <span style={{
                background: estadoActualInfo.color,
                color: 'white',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}>
                {estadoActualInfo.icon} {estadoActualInfo.descripcion}
              </span>
            </div>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: '#cbd5e1' }}>
              {currentPerfil.nombre_apellido} • CI: <strong>{currentPerfil.cedula_identidad}</strong> • Lote: <strong>{currentPerfil.Lote || 'Sin Lote'}</strong>
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '6px'
            }}
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div style={{
          display: 'flex',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 1.5rem'
        }}>
          <button
            onClick={() => setActiveTab('timeline')}
            style={{
              padding: '0.85rem 1.25rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'timeline' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'timeline' ? 700 : 500,
              borderBottom: activeTab === 'timeline' ? '3px solid #3b82f6' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '0.92rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            ⏱️ Ciclo de Vida y Trazabilidad
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('estado')}
              style={{
                padding: '0.85rem 1.25rem',
                border: 'none',
                background: 'transparent',
                color: activeTab === 'estado' ? '#0f172a' : '#64748b',
                fontWeight: activeTab === 'estado' ? 700 : 500,
                borderBottom: activeTab === 'estado' ? '3px solid #f59e0b' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '0.92rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              🔄 Modificar Estado (Admin)
            </button>
          )}

          <button
            onClick={() => setActiveTab('observaciones')}
            style={{
              padding: '0.85rem 1.25rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'observaciones' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'observaciones' ? 700 : 500,
              borderBottom: activeTab === 'observaciones' ? '3px solid #8b5cf6' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '0.92rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            💬 Observaciones ({observacionesList.length})
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, backgroundColor: '#ffffff' }}>
          
          {/* TAB 1: LÍNEA DE TIEMPO / TRAZABILIDAD */}
          {activeTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Tarjeta de Resumen Rápido */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '10px',
                border: '1px solid #e2e8f0'
              }}>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Tipo de Perfil</small>
                  <strong style={{ color: '#0369a1', fontSize: '0.95rem' }}>
                    {currentPerfil.tipo_perfil?.tipo_especial || `Perfil ${currentPerfil.id_tipo_perfil || '-'}`}
                  </strong>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Institución</small>
                  <strong style={{ color: '#334155', fontSize: '0.95rem' }}>{currentPerfil.institucion || '-'}</strong>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>EPS Destino</small>
                  <strong style={{ color: currentPerfil.eps ? '#7e22ce' : '#64748b', fontSize: '0.95rem' }}>
                    {currentPerfil.eps || 'No asignada'}
                  </strong>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Serial MDP</small>
                  <strong style={{ color: currentPerfil.serial_mdp ? '#15803d' : '#94a3b8', fontSize: '0.95rem' }}>
                    {currentPerfil.serial_mdp || 'Sin serial'}
                  </strong>
                </div>
              </div>

              {/* Timeline Visual de Etapas */}
              <div>
                <h4 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '1rem' }}>
                  Línea de Tiempo del Ciclo de Vida
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', paddingLeft: '1.5rem' }}>
                  {/* Línea conectora */}
                  <div style={{
                    position: 'absolute',
                    left: '7px',
                    top: '12px',
                    bottom: '12px',
                    width: '3px',
                    background: '#e2e8f0'
                  }} />

                  {/* 1. Solicitud e Importación */}
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: '-1.5rem',
                      top: '0',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#10b981',
                      border: '3px solid white',
                      boxShadow: '0 0 0 2px #10b981'
                    }} />
                    <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>📥 1. Solicitud e Importación</strong>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{formatDate(currentPerfil.fecha_solicitud)}</span>
                      </div>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: '#475569' }}>
                        Cargado por: <strong>{currentPerfil.usuario_carga?.nombre_completo || 'Sistema'}</strong>
                        {currentPerfil.Lote && <span> • Lote asignado: <strong>{currentPerfil.Lote}</strong></span>}
                      </p>
                    </div>
                  </div>

                  {/* 2. Verificación */}
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: '-1.5rem',
                      top: '0',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: currentPerfil.fecha_verificacion ? '#0284c7' : '#cbd5e1',
                      border: '3px solid white',
                      boxShadow: `0 0 0 2px ${currentPerfil.fecha_verificacion ? '#0284c7' : '#cbd5e1'}`
                    }} />
                    <div style={{
                      background: currentPerfil.fecha_verificacion ? '#f0f9ff' : '#f8fafc',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      border: `1px solid ${currentPerfil.fecha_verificacion ? '#bae6fd' : '#e2e8f0'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: currentPerfil.fecha_verificacion ? '#0369a1' : '#64748b', fontSize: '0.95rem' }}>
                          🔍 2. Verificación Técnica
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          {currentPerfil.fecha_verificacion ? formatDate(currentPerfil.fecha_verificacion) : 'Pendiente'}
                        </span>
                      </div>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: '#475569' }}>
                        {currentPerfil.fecha_verificacion ? (
                          <>Verificado por: <strong>{currentPerfil.usuario_verif?.nombre_completo || 'Revisor Autorizado'}</strong></>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Aún no ha sido verificado en la etapa de validación.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 3. Aprobación */}
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: '-1.5rem',
                      top: '0',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: currentPerfil.fecha_aprobacion ? '#f59e0b' : '#cbd5e1',
                      border: '3px solid white',
                      boxShadow: `0 0 0 2px ${currentPerfil.fecha_aprobacion ? '#f59e0b' : '#cbd5e1'}`
                    }} />
                    <div style={{
                      background: currentPerfil.fecha_aprobacion ? '#fffbeb' : '#f8fafc',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      border: `1px solid ${currentPerfil.fecha_aprobacion ? '#fde68a' : '#e2e8f0'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: currentPerfil.fecha_aprobacion ? '#b45309' : '#64748b', fontSize: '0.95rem' }}>
                          ✅ 3. Aprobación Administrativa
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          {currentPerfil.fecha_aprobacion ? formatDate(currentPerfil.fecha_aprobacion) : 'Pendiente'}
                        </span>
                      </div>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: '#475569' }}>
                        {currentPerfil.fecha_aprobacion ? (
                          <>
                            Aprobado por: <strong>{currentPerfil.usuario_aprob?.nombre_completo || 'Administrador'}</strong>
                            {currentPerfil.ip_aprobo && <span> • IP: <code>{currentPerfil.ip_aprobo}</code></span>}
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Pendiente de aprobación administrativa.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 4. Emisión */}
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: '-1.5rem',
                      top: '0',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: currentPerfil.fecha_emision ? '#8b5cf6' : '#cbd5e1',
                      border: '3px solid white',
                      boxShadow: `0 0 0 2px ${currentPerfil.fecha_emision ? '#8b5cf6' : '#cbd5e1'}`
                    }} />
                    <div style={{
                      background: currentPerfil.fecha_emision ? '#faf5ff' : '#f8fafc',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      border: `1px solid ${currentPerfil.fecha_emision ? '#e9d5ff' : '#e2e8f0'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: currentPerfil.fecha_emision ? '#6b21a8' : '#64748b', fontSize: '0.95rem' }}>
                          💳 4. Emisión y Remisión a EPS
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          {currentPerfil.fecha_emision ? formatDate(currentPerfil.fecha_emision) : 'Pendiente'}
                        </span>
                      </div>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: '#475569' }}>
                        {currentPerfil.fecha_emision ? (
                          <>
                            Remitido a: <strong>{currentPerfil.eps || 'EPS'}</strong>
                            {currentPerfil.serial_mdp && <span> • Serial MDP: <strong>{currentPerfil.serial_mdp}</strong></span>}
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>No ha sido emitido ni remitido a una EPS aún.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Asignación Rápida de Serial MDP (si es admin) */}
              {isAdmin && (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <form onSubmit={handleGuardarSerial} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>
                      Serial MDP (Tarjeta):
                    </label>
                    <input
                      type="text"
                      placeholder="Ingrese el serial del medio de pago..."
                      value={serialMdpInput}
                      onChange={(e) => setSerialMdpInput(e.target.value)}
                      style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', flex: 1, minWidth: '180px' }}
                    />
                    <button
                      type="submit"
                      disabled={savingSerial}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem'
                      }}
                    >
                      {savingSerial ? 'Guardando...' : '💾 Actualizar Serial'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MODIFICAR ESTADO (ADMIN) */}
          {activeTab === 'estado' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <strong style={{ color: '#92400e' }}>Modificación Administrativa de Estado</strong>
                </div>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: '#78350f' }}>
                  Como administrador, puede cambiar manualmente el estado de esta tarjeta a cualquier fase del ciclo de vida.
                  Cada cambio quedará registrado en los logs de auditoría junto con su usuario, fecha y el motivo expuesto.
                </p>
              </div>

              <form onSubmit={handleGuardarCambioEstado} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#1e293b' }}>
                    Seleccione el Nuevo Estado:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                    {ESTADOS_DISPONIBLES.map(est => {
                      const isCurrent = currentPerfil.id_estado_solicitud === est.id_estado;
                      const isSelected = Number(selectedNuevoEstado) === est.id_estado;
                      return (
                        <div
                          key={est.id_estado}
                          onClick={() => setSelectedNuevoEstado(est.id_estado)}
                          style={{
                            padding: '0.85rem',
                            borderRadius: '8px',
                            border: `2px solid ${isSelected ? est.color : '#e2e8f0'}`,
                            background: isSelected ? `${est.color}10` : 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '1.1rem' }}>{est.icon}</span>
                            {isCurrent && (
                              <span style={{ fontSize: '0.68rem', background: '#e2e8f0', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                                ACTUAL
                              </span>
                            )}
                          </div>
                          <strong style={{ color: est.color, fontSize: '0.95rem' }}>{est.descripcion}</strong>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{est.desc}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem', color: '#1e293b' }}>
                    Motivo o Justificación del Cambio (se registrará en el historial):
                  </label>
                  <textarea
                    rows="3"
                    value={motivoCambio}
                    onChange={(e) => setMotivoCambio(e.target.value)}
                    placeholder="Ejemplo: Se corrigieron los datos de cédula; o Tarjeta reportada como extraviada; etc..."
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('timeline')}
                    style={{
                      padding: '0.65rem 1.25rem',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#475569',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingEstado || Number(selectedNuevoEstado) === currentPerfil.id_estado_solicitud}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: Number(selectedNuevoEstado) === currentPerfil.id_estado_solicitud ? '#cbd5e1' : '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: Number(selectedNuevoEstado) === currentPerfil.id_estado_solicitud ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    {savingEstado ? 'Guardando Cambio...' : '💾 Guardar Nuevo Estado'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: OBSERVACIONES */}
          {activeTab === 'observaciones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Formulario para agregar observación */}
              <form onSubmit={handleAddObservacion} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <textarea
                  rows="2"
                  value={newObsText}
                  onChange={(e) => setNewObsText(e.target.value)}
                  placeholder="Agregar nueva nota u observación sobre esta tarjeta..."
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <button
                  type="submit"
                  disabled={submittingObs || !newObsText.trim()}
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: submittingObs || !newObsText.trim() ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    height: '60px'
                  }}
                >
                  {submittingObs ? 'Guardando...' : '➕ Agregar'}
                </button>
              </form>

              {/* Lista de Observaciones */}
              {loadingObs ? (
                <p style={{ textAlign: 'center', color: '#64748b' }}>Cargando observaciones...</p>
              ) : observacionesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  <span style={{ fontSize: '2rem' }}>📝</span>
                  <p style={{ margin: '0.5rem 0 0 0' }}>No hay observaciones registradas para esta tarjeta.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {observacionesList.map((obs) => (
                    <div
                      key={obs.id_observacion}
                      style={{
                        background: '#f8fafc',
                        border: `1px solid ${obs.resuelto ? '#bbf7d0' : obs.atendido ? '#bfdbfe' : '#fed7aa'}`,
                        borderLeft: `4px solid ${obs.resuelto ? '#22c55e' : obs.atendido ? '#3b82f6' : '#f97316'}`,
                        borderRadius: '6px',
                        padding: '0.75rem 1rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
                        <span style={{ fontWeight: 700, color: '#0369a1' }}>
                          👤 {obs.usuario?.nombre_completo || `Usuario #${obs.id_usuario}`}
                        </span>
                        <span>🕒 {formatDate(obs.fecha_creacion)}</span>
                      </div>
                      <p style={{ margin: '0 0 0.5rem 0', color: '#1e293b', fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>
                        {obs.observacion}
                      </p>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.4rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(obs.atendido)}
                            onChange={() => handleToggleObsStatus(obs.id_observacion, 'atendido', obs.atendido)}
                          />
                          <span>👀 Atendido</span>
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(obs.resuelto)}
                            onChange={() => handleToggleObsStatus(obs.id_observacion, 'resuelto', obs.resuelto)}
                          />
                          <span>✅ Resuelto</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '0.85rem 1.5rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <small style={{ color: '#64748b' }}>
            ID Interno (orden): <strong>{currentPerfil.orden}</strong>
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
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalTrazabilidadTarjeta;
