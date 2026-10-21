import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';
import PerfilesTableSection from './PerfilesTableSection';
import './ValidacionPerfiles.css';

const ValidacionPerfiles = () => {
  // Datos y Estados para Sección 1: Validación
  const [unverified, setUnverified] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);

  // Datos y Estados para Sección 2: Aprobación
  const [pendingApproval, setPendingApproval] = useState([]);
  const [selectedApprovalIds, setSelectedApprovalIds] = useState([]);

  // Datos y Estados para Sección 3: Pendientes de Emisión
  const [pendingEmission, setPendingEmission] = useState([]);
  const [selectedEmissionIds, setSelectedEmissionIds] = useState([]);
  const [selectFirstX, setSelectFirstX] = useState(150);

  // Estados Generales
  const [loading, setLoading] = useState(false);
  const [activeStageTab, setActiveStageTab] = useState('all'); // 'all' | 'validacion' | 'aprobacion' | 'emision'

  // Estados para Formulario de Envío a EPS
  const [epsDestino, setEpsDestino] = useState('TDP');
  const [emails, setEmails] = useState('');
  const [subject, setSubject] = useState('Listado de Perfiles Validados');
  const [body, setBody] = useState('Adjunto encontrará el listado de perfiles validados.');
  const [batchSize, setBatchSize] = useState(1500);
  const [sending, setSending] = useState(false);

  // Carga de datos
  const fetchUnverified = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/unverified`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUnverified(data);
        setSelectedIds([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado de no verificados');
    }
    setLoading(false);
  };

  const fetchPendingApproval = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/pending_approval`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingApproval(data);
        setSelectedApprovalIds([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado pendientes de aprobación');
    }
    setLoading(false);
  };

  const fetchPendingEmission = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/pending_emission`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingEmission(data);
        setSelectedEmissionIds([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error obteniendo listado pendientes de emisión');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnverified();
    fetchPendingApproval();
    fetchPendingEmission();
  }, []);

  // Acción: Seleccionar los primeros X de emisión
  const handleSelectFirstX = (e) => {
    if (e) e.preventDefault();
    if (selectFirstX > 0 && pendingEmission.length > 0) {
      const ids = pendingEmission.slice(0, selectFirstX).map(p => p.orden);
      setSelectedEmissionIds(ids);
    }
  };

  // Acción: Verificar
  const handleVerify = async () => {
    if (selectedIds.length === 0) {
      alert("Seleccione al menos un registro para verificar");
      return;
    }

    if (!window.confirm(`¿Está seguro de verificar ${selectedIds.length} perfil(es)?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/perfiles/validate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(selectedIds)
      });
      if (res.ok) {
        alert("Perfiles verificados exitosamente");
        fetchUnverified();
        fetchPendingApproval();
      } else {
        alert("Error al verificar los perfiles");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al verificar");
    }
    setLoading(false);
  };

  // Acción: Aprobar
  const handleApprove = async () => {
    if (selectedApprovalIds.length === 0) {
      alert("Seleccione al menos un registro para aprobar");
      return;
    }

    if (!window.confirm(`¿Está seguro de aprobar ${selectedApprovalIds.length} perfil(es)?`)) {
      return;
    }

    setLoading(true);
    try {
      const device_id = localStorage.getItem('device_id') || 'unknown-device';
      const res = await fetch(`${API_BASE}/perfiles/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ids: selectedApprovalIds,
          device_id: device_id
        })
      });
      if (res.ok) {
        alert("Perfiles aprobados exitosamente");
        fetchPendingApproval();
        fetchPendingEmission();
      } else {
        alert("Error al aprobar los perfiles");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al aprobar");
    }
    setLoading(false);
  };

  // Acción: Enviar Correos y Emitir
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (selectedEmissionIds.length === 0) {
      alert("Debe seleccionar al menos un registro para enviar.");
      return;
    }
    if (!epsDestino) {
      alert("Debe seleccionar una EPS destino.");
      return;
    }
    if (!emails.trim()) {
      alert("Debe ingresar al menos un correo destino.");
      return;
    }

    if (!window.confirm(`Se remitirán ${selectedEmissionIds.length} perfiles a la EPS ${epsDestino}. ¿Desea proceder?`)) {
      return;
    }

    setSending(true);
    const formData = new FormData();
    formData.append('correos', emails);
    formData.append('cantidad_por_correo', batchSize);
    formData.append('asunto', subject);
    formData.append('cuerpo', body);
    formData.append('eps', epsDestino);
    formData.append('ids', selectedEmissionIds.join(','));

    try {
      const res = await fetch(`${API_BASE}/perfiles/send_email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Correos encolados exitosamente");
        fetchPendingEmission();
        setSelectedEmissionIds([]);
      } else {
        alert(`Error: ${data.detail || 'Ocurrió un error al procesar el envío'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al solicitar envío de correos");
    }
    setSending(false);
  };

  // Barra de selección rápida para la sección de Emisión
  const quickEmissionBar = (
    <div className="vp-emission-quickbar">
      <div>
        <span>Total disponibles para emisión: <strong>{pendingEmission.length}</strong></span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="number"
          className="vp-number-input"
          value={selectFirstX}
          onChange={(e) => setSelectFirstX(Math.max(1, Number(e.target.value)))}
          min="1"
          max={pendingEmission.length || 1}
        />
        <button
          type="button"
          onClick={handleSelectFirstX}
          disabled={pendingEmission.length === 0}
          className="vp-btn-purple-subtle"
        >
          ⚡ Seleccionar los primeros {selectFirstX}
        </button>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span>Seleccionados para emisión:</span>
        <strong style={{ color: selectedEmissionIds.length > 0 ? '#7e22ce' : 'inherit', fontSize: '1.05rem' }}>
          {selectedEmissionIds.length}
        </strong>
      </div>
    </div>
  );

  return (
    <div className="vp-container">
      {/* Encabezado Principal y Pestañas de Etapas */}
      <div className="vp-header">
        <div className="vp-header-title">
          <h2>🛡️ Gestión y Validación de Perfiles Especiales</h2>
          <p>
            Filtre por lote, tipo de perfil o texto. Agrupe beneficiarios por lotes para selección masiva o desglose en vista plana.
          </p>
        </div>

        {/* Pestañas para enfocar una etapa o ver todas */}
        <div className="vp-tabs">
          <button
            onClick={() => setActiveStageTab('all')}
            className={`vp-tab-btn ${activeStageTab === 'all' ? 'active' : ''}`}
          >
            📑 Ver Todas las Etapas
          </button>
          <button
            onClick={() => setActiveStageTab('validacion')}
            className={`vp-tab-btn ${activeStageTab === 'validacion' ? 'active' : ''}`}
          >
            🔍 Validación
            <span className="vp-tab-badge">{unverified.length}</span>
          </button>
          <button
            onClick={() => setActiveStageTab('aprobacion')}
            className={`vp-tab-btn ${activeStageTab === 'aprobacion' ? 'active' : ''}`}
          >
            📝 Aprobación
            <span className="vp-tab-badge badge-warning">{pendingApproval.length}</span>
          </button>
          <button
            onClick={() => setActiveStageTab('emision')}
            className={`vp-tab-btn ${activeStageTab === 'emision' ? 'active' : ''}`}
          >
            ✉️ Emisión a EPS
            <span className="vp-tab-badge badge-purple">{pendingEmission.length}</span>
          </button>
        </div>
      </div>

      {/* SECCIÓN 1: VALIDACIÓN (UNVERIFIED) */}
      {(activeStageTab === 'all' || activeStageTab === 'validacion') && (
        <PerfilesTableSection
          title="1. Validación de Perfiles Especiales"
          subtitle="Listado de beneficiarios importados pendientes de verificación inicial."
          icon="🔍"
          iconTheme="blue"
          data={unverified}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          mainActionText={selectedIds.length > 0 ? `Verificar Seleccionados (${selectedIds.length})` : "Verificar Seleccionados"}
          onMainAction={handleVerify}
          actionButtonColor="#3498db"
          loading={loading}
          initialViewMode="flat"
        />
      )}

      {/* SECCIÓN 2: APROBACIÓN (PENDING APPROVAL) */}
      {(activeStageTab === 'all' || activeStageTab === 'aprobacion') && (
        <PerfilesTableSection
          title="2. Aprobación de Perfiles Especiales"
          subtitle="Listado de beneficiarios verificados pendientes de aprobación definitiva."
          icon="📝"
          iconTheme="orange"
          data={pendingApproval}
          selectedIds={selectedApprovalIds}
          onSelectionChange={setSelectedApprovalIds}
          mainActionText={selectedApprovalIds.length > 0 ? `Aprobar Seleccionados (${selectedApprovalIds.length})` : "Aprobar Seleccionados"}
          onMainAction={handleApprove}
          actionButtonColor="#f39c12"
          loading={loading}
          extraColumnHeader="Verificado por"
          renderExtraCell={(p) => (
            <span className="vp-badge vp-badge-user">
              {p.usuario_verif?.nombre_completo || '-'}
            </span>
          )}
          initialViewMode="flat"
        />
      )}

      {/* SECCIÓN 3: PENDIENTES DE EMISIÓN */}
      {(activeStageTab === 'all' || activeStageTab === 'emision') && (
        <>
          <PerfilesTableSection
            title="3. Pendientes de Emisión a EPS"
            subtitle="Beneficiarios aprobados listos para ser remitidos y asignados a una EPS (TDP / EPAS)."
            icon="✉️"
            iconTheme="purple"
            data={pendingEmission}
            selectedIds={selectedEmissionIds}
            onSelectionChange={setSelectedEmissionIds}
            mainActionText={null} // La acción principal se realiza en el formulario inferior
            loading={loading}
            extraColumnHeader="Aprobado por"
            renderExtraCell={(p) => (
              <span className="vp-badge vp-badge-user">
                {p.usuario_aprob?.nombre_completo || '-'}
              </span>
            )}
            quickEmissionBar={quickEmissionBar}
            initialViewMode="flat"
          />

          {/* Formulario de Remisión por Correo a EPS */}
          <div className="vp-email-card">
            <h3>📬 Remitir Listado por Correo y Emitir</h3>
            <p>
              Envíe los perfiles seleccionados ({selectedEmissionIds.length}) a los correos especificados registrando su EPS correspondiente.
            </p>

            <form onSubmit={handleSendEmail}>
              <div className="vp-form-group">
                <label className="vp-form-label">EPS Destino:</label>
                <select
                  value={epsDestino}
                  onChange={(e) => setEpsDestino(e.target.value)}
                  className="vp-form-select"
                >
                  <option value="TDP">TDP</option>
                  <option value="EPAS">EPAS</option>
                </select>
              </div>

              <div className="vp-form-group">
                <label className="vp-form-label">Correos Destino (separados por coma):</label>
                <input
                  type="text"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="correo1@ejemplo.com, correo2@ejemplo.com"
                  className="vp-form-input"
                  required
                />
              </div>

              <div className="vp-form-group">
                <label className="vp-form-label">Asunto del Correo:</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="vp-form-input"
                  required
                />
              </div>

              <div className="vp-form-group">
                <label className="vp-form-label">Cuerpo del Mensaje:</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows="3"
                  className="vp-form-textarea"
                  required
                />
              </div>

              <div className="vp-form-group">
                <label className="vp-form-label">Registros por correo (lotes de envío):</label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  min="100"
                  max="10000"
                  className="vp-form-input"
                />
              </div>

              <button
                type="submit"
                disabled={sending || selectedEmissionIds.length === 0}
                className="vp-btn-submit-email"
              >
                {sending
                  ? "⏳ Iniciando envío..."
                  : `📤 Enviar ${selectedEmissionIds.length} Perfiles Seleccionados a ${epsDestino}`}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default ValidacionPerfiles;
