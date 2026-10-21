import React, { useState, useMemo, useEffect, useRef } from 'react';

// Componente para Checkbox con soporte nativo de estado indeterminado
const IndeterminateCheckbox = ({ checked, indeterminate, onChange, disabled, style, id, title }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      type="checkbox"
      ref={ref}
      id={id}
      title={title}
      checked={Boolean(checked)}
      onChange={onChange}
      disabled={disabled}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', width: '16px', height: '16px', ...style }}
    />
  );
};

// Helper para obtener el nombre del lote
export const getLoteName = (p) => {
  const lote = p.Lote || p.lote;
  if (!lote || String(lote).trim() === '') return 'Sin Lote Asignado';
  return String(lote).trim();
};

// Helper para obtener el tipo de perfil
export const getTipoPerfilName = (p) => {
  if (p.tipo_perfil && p.tipo_perfil.tipo_especial) {
    return p.tipo_perfil.tipo_especial;
  }
  if (p.id_tipo_perfil) {
    return `Perfil Tipo ${p.id_tipo_perfil}`;
  }
  return 'Sin Tipo Asignado';
};

const PerfilesTableSection = ({
  title,
  subtitle,
  icon = "📋",
  iconTheme = "blue", // 'blue' | 'orange' | 'purple'
  data = [],
  selectedIds = [],
  onSelectionChange,
  mainActionText,
  onMainAction,
  actionButtonColor = "#3498db",
  loading = false,
  extraColumnHeader = null,
  renderExtraCell = null,
  quickEmissionBar = null,
  initialViewMode = 'flat', // 'flat' | 'grouped'
}) => {
  // Estados de Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLoteFilter, setSelectedLoteFilter] = useState('');
  const [selectedTipoFilter, setSelectedTipoFilter] = useState('');
  const [selectionFilter, setSelectionFilter] = useState('all'); // 'all' | 'selected' | 'unselected'

  // Modo de vista: 'flat' (disgregada) o 'grouped' (agrupada por lote)
  const [viewMode, setViewMode] = useState(initialViewMode);

  // Lotes expandidos en vista agrupada (Set de nombres de lote)
  const [expandedLotes, setExpandedLotes] = useState(new Set());

  // Opciones únicas calculadas para los desplegables de filtro
  const { uniqueLotes, uniqueTipos } = useMemo(() => {
    const lotesCountMap = {};
    const tiposCountMap = {};

    data.forEach(p => {
      const loteName = getLoteName(p);
      lotesCountMap[loteName] = (lotesCountMap[loteName] || 0) + 1;

      const tipoName = getTipoPerfilName(p);
      tiposCountMap[tipoName] = (tiposCountMap[tipoName] || 0) + 1;
    });

    const lotes = Object.entries(lotesCountMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const tipos = Object.entries(tiposCountMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { uniqueLotes: lotes, uniqueTipos: tipos };
  }, [data]);

  // Filtrado de datos en memoria
  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return data.filter(p => {
      // 1. Filtro de búsqueda por texto (cédula, nombre, institución)
      if (term) {
        const doc = String(p.cedula_identidad || '').toLowerCase();
        const nom = String(p.nombre_apellido || '').toLowerCase();
        const inst = String(p.institucion || '').toLowerCase();
        const lote = getLoteName(p).toLowerCase();
        const tipo = getTipoPerfilName(p).toLowerCase();

        if (!doc.includes(term) && !nom.includes(term) && !inst.includes(term) && !lote.includes(term) && !tipo.includes(term)) {
          return false;
        }
      }

      // 2. Filtro por Lote
      if (selectedLoteFilter) {
        if (getLoteName(p) !== selectedLoteFilter) {
          return false;
        }
      }

      // 3. Filtro por Tipo de Perfil
      if (selectedTipoFilter) {
        if (getTipoPerfilName(p) !== selectedTipoFilter) {
          return false;
        }
      }

      // 4. Filtro por Selección
      const isSelected = selectedIds.includes(p.orden);
      if (selectionFilter === 'selected' && !isSelected) return false;
      if (selectionFilter === 'unselected' && isSelected) return false;

      return true;
    });
  }, [data, searchTerm, selectedLoteFilter, selectedTipoFilter, selectionFilter, selectedIds]);

  // Agrupación por Lote a partir de los datos filtrados
  const groupedData = useMemo(() => {
    const groups = {};

    filteredData.forEach(p => {
      const loteName = getLoteName(p);
      if (!groups[loteName]) {
        groups[loteName] = {
          loteName,
          items: [],
          tiposCount: {}
        };
      }
      groups[loteName].items.push(p);

      const tipoName = getTipoPerfilName(p);
      groups[loteName].tiposCount[tipoName] = (groups[loteName].tiposCount[tipoName] || 0) + 1;
    });

    return Object.values(groups).sort((a, b) => a.loteName.localeCompare(b.loteName));
  }, [filteredData]);

  // Verificar si hay filtros activos
  const hasActiveFilters = Boolean(searchTerm || selectedLoteFilter || selectedTipoFilter || selectionFilter !== 'all');

  // Limpiar filtros
  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedLoteFilter('');
    setSelectedTipoFilter('');
    setSelectionFilter('all');
  };

  // Manejadores de Selección
  const handleToggleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  // Seleccionar o deseleccionar todos los registros filtrados
  const filteredIds = useMemo(() => filteredData.map(p => p.orden), [filteredData]);
  const isAllFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
  const isSomeFilteredSelected = filteredIds.some(id => selectedIds.includes(id)) && !isAllFilteredSelected;

  const handleToggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      // Quitar los filtrados de la selección
      onSelectionChange(selectedIds.filter(id => !filteredIds.includes(id)));
    } else {
      // Agregar los filtrados que falten a la selección
      const newIds = new Set([...selectedIds, ...filteredIds]);
      onSelectionChange(Array.from(newIds));
    }
  };

  // Manejar selección de un Lote completo
  const handleToggleSelectLote = (loteItems) => {
    const loteIds = loteItems.map(p => p.orden);
    const allLoteSelected = loteIds.every(id => selectedIds.includes(id));

    if (allLoteSelected) {
      // Deseleccionar lote
      onSelectionChange(selectedIds.filter(id => !loteIds.includes(id)));
    } else {
      // Seleccionar lote
      const newIds = new Set([...selectedIds, ...loteIds]);
      onSelectionChange(Array.from(newIds));
    }
  };

  // Manejo de expansión de lotes individuales
  const toggleExpandLote = (loteName) => {
    setExpandedLotes(prev => {
      const next = new Set(prev);
      if (next.has(loteName)) {
        next.delete(loteName);
      } else {
        next.add(loteName);
      }
      return next;
    });
  };

  // Expandir todos los lotes
  const handleExpandAllLotes = () => {
    const allLoteNames = new Set(groupedData.map(g => g.loteName));
    setExpandedLotes(allLoteNames);
  };

  // Colapsar todos los lotes
  const handleCollapseAllLotes = () => {
    setExpandedLotes(new Set());
  };

  // Conmutar a vista disgregada / agrupada
  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
  };

  return (
    <div className="vp-section-card">
      {/* Topbar: Título y Botón Principal de Acción */}
      <div className="vp-section-topbar">
        <div className="vp-section-header">
          <div className={`vp-section-icon vp-icon-${iconTheme}`}>
            {icon}
          </div>
          <div className="vp-section-title">
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {mainActionText && (
            <button
              onClick={onMainAction}
              disabled={selectedIds.length === 0 || loading}
              className="vp-main-action-btn"
              style={{ background: actionButtonColor }}
            >
              {mainActionText}
            </button>
          )}
        </div>
      </div>

      {/* Barra Rápida de Emisión (opcional para etapa 3) */}
      {quickEmissionBar}

      {/* Panel de Filtros */}
      <div className="vp-filters-panel">
        <div className="vp-filters-row">
          {/* Buscador Rápido */}
          <div className="vp-filter-group search-group">
            <label className="vp-filter-label" htmlFor={`search-${title}`}>Buscar Beneficiario</label>
            <div className="vp-input-container">
              <span className="vp-input-icon">🔍</span>
              <input
                id={`search-${title}`}
                type="text"
                className="vp-search-input"
                placeholder="Buscar por cédula, nombre, institución..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="vp-input-clear"
                  onClick={() => setSearchTerm('')}
                  title="Borrar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filtro por Lote */}
          <div className="vp-filter-group">
            <label className="vp-filter-label" htmlFor={`lote-${title}`}>Filtrar por Lote</label>
            <select
              id={`lote-${title}`}
              className="vp-select"
              value={selectedLoteFilter}
              onChange={(e) => setSelectedLoteFilter(e.target.value)}
            >
              <option value="">Todos los Lotes ({data.length})</option>
              {uniqueLotes.map(l => (
                <option key={l.name} value={l.name}>
                  {l.name} ({l.count})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Tipo de Perfil */}
          <div className="vp-filter-group">
            <label className="vp-filter-label" htmlFor={`tipo-${title}`}>Tipo de Perfil</label>
            <select
              id={`tipo-${title}`}
              className="vp-select"
              value={selectedTipoFilter}
              onChange={(e) => setSelectedTipoFilter(e.target.value)}
            >
              <option value="">Todos los Tipos ({data.length})</option>
              {uniqueTipos.map(t => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Estado de Selección */}
          <div className="vp-filter-group">
            <label className="vp-filter-label" htmlFor={`sel-${title}`}>Selección</label>
            <select
              id={`sel-${title}`}
              className="vp-select"
              value={selectionFilter}
              onChange={(e) => setSelectionFilter(e.target.value)}
            >
              <option value="all">Todos los registros ({data.length})</option>
              <option value="selected">Solo seleccionados ({selectedIds.length})</option>
              <option value="unselected">Solo sin seleccionar ({Math.max(0, data.length - selectedIds.length)})</option>
            </select>
          </div>

          {/* Botón Limpiar Filtros */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="vp-clear-btn"
              title="Restablecer todos los filtros"
            >
              ✕ Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Barra de Conmutación de Modo de Vista (Agrupar por Lote / Disgregar) */}
      <div className="vp-view-toolbar">
        {/* Conmutador Agrupar vs Disgregar */}
        <div className="vp-toggle-container">
          <button
            onClick={() => handleToggleViewMode('flat')}
            className={`vp-toggle-btn ${viewMode === 'flat' ? 'active' : ''}`}
            title="Ver todos los registros individuales (desagrupados)"
          >
            📋 Vista Disgregada (Plana)
          </button>
          <button
            onClick={() => handleToggleViewMode('grouped')}
            className={`vp-toggle-btn ${viewMode === 'grouped' ? 'active' : ''}`}
            title="Agrupar beneficiarios según su lote"
          >
            📦 Agrupar por Lote
          </button>
        </div>

        {/* Estadísticas de visualización y selección */}
        <div className="vp-view-stats">
          <span>Mostrando <strong>{filteredData.length}</strong> de <strong>{data.length}</strong></span>
          <span>•</span>
          <span style={{ color: selectedIds.length > 0 ? '#16a34a' : 'inherit' }}>
            <strong>{selectedIds.length}</strong> seleccionados
          </span>
          {hasActiveFilters && (
            <span style={{ fontSize: '0.8rem', color: '#b45309', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              Filtros activos
            </span>
          )}
        </div>

        {/* Acciones de Lotes en Vista Agrupada */}
        {viewMode === 'grouped' ? (
          <div className="vp-group-controls">
            <button onClick={handleExpandAllLotes} className="vp-mini-btn" title="Expandir el desglose de todos los lotes">
              ▾ Expandir Todos
            </button>
            <button onClick={handleCollapseAllLotes} className="vp-mini-btn" title="Colapsar todos los lotes">
              ▴ Colapsar Todos
            </button>
            <button onClick={() => handleToggleViewMode('flat')} className="vp-mini-btn" title="Volver a la vista plana y disgregada">
              📋 Disgregar Todo
            </button>
          </div>
        ) : (
          <div className="vp-group-controls">
            <button
              onClick={handleToggleSelectAllFiltered}
              className="vp-mini-btn"
              disabled={filteredData.length === 0}
              title={isAllFilteredSelected ? "Deseleccionar todos los filtrados" : "Seleccionar todos los registros visibles"}
            >
              {isAllFilteredSelected ? "✕ Deseleccionar Visibles" : `✓ Seleccionar ${filteredData.length} Visibles`}
            </button>
          </div>
        )}
      </div>

      {/* Contenido Principal: Spinner o Tablas */}
      {loading ? (
        <div className="vp-loading-state">
          <div className="vp-spinner"></div>
          <p>Cargando información de perfiles...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="vp-empty-state">
          <div className="vp-empty-icon">📭</div>
          <p style={{ fontWeight: 600 }}>No hay registros para mostrar</p>
          <p style={{ fontSize: '0.85rem' }}>
            {hasActiveFilters
              ? "Ningún perfil coincide con los filtros aplicados. Intente modificarlos o limpiarlos."
              : "No se registran beneficiarios pendientes en esta etapa."}
          </p>
          {hasActiveFilters && (
            <button onClick={handleClearFilters} className="vp-mini-btn" style={{ marginTop: '0.5rem' }}>
              Limpiar Filtros
            </button>
          )}
        </div>
      ) : viewMode === 'grouped' ? (
        /* VISTA AGRUPADA POR LOTE */
        <div className="vp-grouped-container">
          {groupedData.map((group) => {
            const loteIds = group.items.map(p => p.orden);
            const selectedInLote = loteIds.filter(id => selectedIds.includes(id)).length;
            const isAllLoteSelected = selectedInLote === loteIds.length && loteIds.length > 0;
            const isPartialLoteSelected = selectedInLote > 0 && !isAllLoteSelected;
            const isOpen = expandedLotes.has(group.loteName);

            let cardStatusClass = '';
            if (isAllLoteSelected) cardStatusClass = 'selected-all';
            else if (isPartialLoteSelected) cardStatusClass = 'selected-partial';

            return (
              <div key={group.loteName} className={`vp-lote-card ${cardStatusClass} ${isOpen ? 'open' : ''}`}>
                {/* Cabecera del Lote */}
                <div
                  className="vp-lote-header"
                  onClick={() => toggleExpandLote(group.loteName)}
                >
                  <div className="vp-lote-left">
                    {/* Checkbox para seleccionar todo el lote */}
                    <div
                      className="vp-lote-checkbox-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IndeterminateCheckbox
                        checked={isAllLoteSelected}
                        indeterminate={isPartialLoteSelected}
                        onChange={() => handleToggleSelectLote(group.items)}
                        title={`Seleccionar todo el lote ${group.loteName}`}
                      />
                    </div>

                    {/* Nombre del Lote */}
                    <div className="vp-lote-title">
                      <span>📦 {group.loteName}</span>
                    </div>

                    {/* Conteo total del Lote */}
                    <span className="vp-lote-badge-count">
                      {group.items.length} {group.items.length === 1 ? 'perfil' : 'perfiles'}
                    </span>

                    {/* Conteo de seleccionados */}
                    <span className={`vp-lote-badge-sel ${isAllLoteSelected ? 'all' : isPartialLoteSelected ? 'partial' : 'none'}`}>
                      {selectedInLote} de {group.items.length} seleccionados
                    </span>

                    {/* Desglose de tipos de perfil dentro del lote */}
                    <div className="vp-lote-breakdown">
                      {Object.entries(group.tiposCount).map(([tipo, count]) => (
                        <span key={tipo} className="vp-breakdown-chip" title={`${count} personas con ${tipo}`}>
                          {tipo}: <strong>{count}</strong>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="vp-lote-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleExpandLote(group.loteName)}
                      className="vp-lote-disgregar-btn"
                      title={isOpen ? "Colapsar lote" : "Desglosar y disgregar los beneficiarios de este lote"}
                    >
                      {isOpen ? '▲ Ocultar' : `▼ Desglosar / Disgregar (${group.items.length})`}
                    </button>
                  </div>
                </div>

                {/* Contenido Desglosado del Lote (cuando está expandido) */}
                {isOpen && (
                  <div className="vp-lote-body">
                    <div className="vp-table-wrapper" style={{ maxHeight: '350px' }}>
                      <table className="vp-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                              <IndeterminateCheckbox
                                checked={isAllLoteSelected}
                                indeterminate={isPartialLoteSelected}
                                onChange={() => handleToggleSelectLote(group.items)}
                                title="Seleccionar todos los de este lote"
                              />
                            </th>
                            <th>Documento</th>
                            <th>Nombre y Apellido</th>
                            <th>Tipo de Perfil</th>
                            <th>Institución</th>
                            {extraColumnHeader && <th>{extraColumnHeader}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((p) => {
                            const isSelected = selectedIds.includes(p.orden);
                            return (
                              <tr key={p.orden} className={isSelected ? 'row-selected' : ''}>
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelectOne(p.orden)}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </td>
                                <td style={{ fontWeight: 600 }}>{p.cedula_identidad || '-'}</td>
                                <td>{p.nombre_apellido || '-'}</td>
                                <td>
                                  <span className="vp-badge vp-badge-perfil">
                                    {getTipoPerfilName(p)}
                                  </span>
                                </td>
                                <td style={{ color: '#64748b' }}>{p.institucion || '-'}</td>
                                {renderExtraCell && <td>{renderExtraCell(p)}</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA PLANA / DISGREGADA */
        <div className="vp-table-wrapper">
          <table className="vp-table">
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center' }}>
                  <IndeterminateCheckbox
                    checked={isAllFilteredSelected}
                    indeterminate={isSomeFilteredSelected}
                    onChange={handleToggleSelectAllFiltered}
                    title="Seleccionar / Deseleccionar todos los registros visibles"
                  />
                </th>
                <th>Documento</th>
                <th>Nombre y Apellido</th>
                <th>Tipo de Perfil</th>
                <th>Lote</th>
                <th>Institución</th>
                {extraColumnHeader && <th>{extraColumnHeader}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((p) => {
                const isSelected = selectedIds.includes(p.orden);
                const lote = getLoteName(p);
                return (
                  <tr key={p.orden} className={isSelected ? 'row-selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(p.orden)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.cedula_identidad || '-'}</td>
                    <td>{p.nombre_apellido || '-'}</td>
                    <td>
                      <span className="vp-badge vp-badge-perfil">
                        {getTipoPerfilName(p)}
                      </span>
                    </td>
                    <td>
                      <span className={`vp-badge vp-badge-lote ${lote !== 'Sin Lote Asignado' ? 'highlight' : ''}`}>
                        📦 {lote}
                      </span>
                    </td>
                    <td style={{ color: '#64748b' }}>{p.institucion || '-'}</td>
                    {renderExtraCell && <td>{renderExtraCell(p)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PerfilesTableSection;
