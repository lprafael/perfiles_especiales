# models.py
# Modelos de base de datos para el sistema

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Table, JSON, Float, Date, Time
from geoalchemy2 import Geometry
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()

# Tabla de asociación para roles y permisos (many-to-many)
rol_permiso = Table(
    'rol_permiso',
    Base.metadata,
    Column('rol_id', Integer, ForeignKey('sistema.roles.id'), primary_key=True),
    Column('permiso_id', Integer, ForeignKey('sistema.permisos.id'), primary_key=True),
    schema='sistema'
)

# Tabla de asociación para usuarios y roles (many-to-many) - heredada
usuario_rol = Table(
    'usuario_rol',
    Base.metadata,
    Column('usuario_id', Integer, ForeignKey('sistema.usuarios.id'), primary_key=True),
    Column('rol_id', Integer, ForeignKey('sistema.roles.id'), primary_key=True),
    schema='sistema'
)

# Modelos existentes del sistema
class Gremio(Base):
    __tablename__ = "gremios"
    
    gre_id = Column(Integer, primary_key=True, index=True)
    gre_nombre = Column(String, unique=True, index=True)
    gre_estado = Column(Integer)

class EOT(Base):
    __tablename__ = "eots"

    eot_id = Column(Integer, primary_key=True, autoincrement=True)
    eot_nombre = Column(String)
    eot_linea = Column(String)
    cod_catalogo = Column(Integer)
    cod_planilla = Column(String)
    cod_epas = Column(String)
    cod_tdp = Column(String)
    situacion = Column(Integer, default=0)
    gre_id = Column(Integer, default=0)
    autorizado = Column(Integer, default=0)
    operativo = Column(Integer, default=0)
    reserva = Column(Integer, default=0)
    permisionario = Column(Boolean)
    operativo_declarado = Column(Integer, default=0)
    reserva_declarada = Column(Integer, default=0)
    id_eot_vmt_hex = Column(String)
    e_mail = Column(String)
    
    # Campos obligatorios GTFS
    agency_timezone = Column(String, default="America/Asuncion")
    agency_url = Column(String, nullable=True)
    agency_lang = Column(String, default="es")
    
    # Nuevos campos UF
    eot_UF = Column(Boolean, default=False)
    id_tipo_eot = Column(Integer, ForeignKey('tipos_eot.id_tipo'), nullable=True)
    
    # Relaciones
    tipo_eot = relationship("TipoEOT", backref="eots")

class TipoEOT(Base):
    __tablename__ = "tipos_eot"
    
    id_tipo = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)

class UnidadFuncional(Base):
    __tablename__ = "unidades_funcionales"
    __table_args__ = {"schema": "gestion_uf"}
    
    id_uf = Column(Integer, primary_key=True, autoincrement=True)
    nombre_uf = Column(String(100), nullable=False)
    tipo_uf = Column(String(50))
    estado = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, server_default=func.now())
    
    # Relaciones
    troncales = relationship("UFTroncal", back_populates="uf", cascade="all, delete-orphan")

class ComposicionUF(Base):
    __tablename__ = "composicion_uf"
    __table_args__ = {"schema": "gestion_uf"}
    
    id_composicion_uf = Column(Integer, primary_key=True, autoincrement=True)
    id_uf = Column(Integer, ForeignKey('gestion_uf.unidades_funcionales.id_uf'), nullable=False)
    ruta_hex = Column(String, ForeignKey('catalogo_rutas.ruta_hex'), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=True)
    resolucion_legal = Column(String(100), nullable=True)
    
    uf = relationship("UnidadFuncional", backref="composicion")
    ruta = relationship("CatalogoRuta")

class UFTroncal(Base):
    __tablename__ = "uf_troncales"
    __table_args__ = {"schema": "gestion_uf"}
    
    id_troncal = Column(Integer, primary_key=True, autoincrement=True)
    id_uf = Column(Integer, ForeignKey('gestion_uf.unidades_funcionales.id_uf'), nullable=False)
    nombre = Column(String(100), nullable=True)
    descripcion = Column(Text, nullable=True)
    geom = Column(Geometry('GEOMETRY', srid=4326), nullable=False)
    color_hex = Column(String(7), default='#FF0000')
    es_principal = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relaciones
    uf = relationship("UnidadFuncional", back_populates="troncales")
    geocercas = relationship("Geocerca", backref="troncal_uf", cascade="all, delete-orphan")

class ComposicionConsorcio(Base):
    __tablename__ = "composicion_consorcio"
    __table_args__ = {"schema": "gestion_uf"}
    
    id_comp_cons = Column(Integer, primary_key=True, autoincrement=True)
    id_consorcio = Column(Integer, ForeignKey('eots.eot_id'), nullable=False)
    id_eot = Column(Integer, ForeignKey('eots.eot_id'), nullable=False)
    participacion_pct = Column(Float, nullable=True)
    es_lider = Column(Boolean, default=False)
    fecha_inicio = Column(Date, nullable=True)
    fecha_fin = Column(Date, nullable=True)
    observaciones = Column(Text, nullable=True)
    
    consorcio = relationship("EOT", foreign_keys=[id_consorcio], backref="miembros_consorcio")
    empresa = relationship("EOT", foreign_keys=[id_eot], backref="consorcios_pertenece")

class Feriado(Base):
    __tablename__ = "feriados"

    fecha = Column(Date, primary_key=True)  # Es común que 'fecha' sea la PK si no hay 'id'
    dia = Column(String)
    nrodiasemana = Column(Integer)
    descripcion = Column(String)
    observacion = Column(String)

class Linea(Base):
    __tablename__ = "lineas"
    
    id_linea = Column(Integer, primary_key=True, autoincrement=True)
    numero_linea = Column(String, nullable=False)
    nombre_comercial = Column(Text)
    estado = Column(Boolean, default=True)
    identificador_troncal = Column(Text)
    id_uf = Column(Integer, ForeignKey('gestion_uf.unidades_funcionales.id_uf'), nullable=True)
    color_hex = Column(String, default='#3B82F6')
    
    # Campos GTFS
    route_type = Column(Integer, default=3) # 3=Bus
    route_text_color = Column(String, default='#FFFFFF')
    
    creado_en = Column(DateTime, server_default=func.now())
    
    # Relación
    uf = relationship("UnidadFuncional", backref="lineas")

# === HISTÓRICO DE ITINERARIOS ===
class HistoricoItinerario(Base):
    __tablename__ = "historico_itinerario"
    __table_args__ = {"schema": "geometria"}
    
    id_itinerario = Column(Integer, primary_key=True, autoincrement=True)
    ruta_hex = Column(String, nullable=False)
    fecha_inicio_vigencia = Column(Date, nullable=False)
    fecha_fin_vigencia = Column(Date, nullable=True)
    geom = Column(Geometry('GEOMETRY', srid=4326), nullable=False)
    vigente = Column(Boolean, default=True)
    observacion = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relación con paradas oficiales
    paradas = relationship("ParadaOficial", secondary="geometria.itinerario_parada", back_populates="itinerarios")

class TipoGeocerca(Base):
    __tablename__ = "tipos_geocerca"
    __table_args__ = {"schema": "geometria"}
    
    id_tipo = Column(Integer, primary_key=True)
    nombre = Column(String(50), nullable=False)
    descripcion = Column(Text)

class Geocerca(Base):
    __tablename__ = "geocercas"
    __table_args__ = {"schema": "geometria"}
    
    id_geocerca = Column(Integer, primary_key=True, autoincrement=True)
    id_itinerario = Column(Integer, ForeignKey('geometria.historico_itinerario.id_itinerario'), nullable=True)
    id_troncal_uf = Column(Integer, ForeignKey('gestion_uf.uf_troncales.id_troncal'), nullable=True)
    id_tipo = Column(Integer, ForeignKey('geometria.tipos_geocerca.id_tipo'), nullable=False)
    orden = Column(Integer, default=0, nullable=False)
    geom = Column(Geometry('GEOMETRY', srid=4326), nullable=False)
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relaciones
    itinerario = relationship("HistoricoItinerario", backref=backref("geocercas", cascade="all, delete-orphan"))
    tipo = relationship("TipoGeocerca")

class PuntoTerminal(Base):
    __tablename__ = "puntos_terminales"
    __table_args__ = {"schema": "geometria"}
    
    id_punto = Column(Integer, primary_key=True, autoincrement=True)
    id_tipo_geocerca = Column(Integer, nullable=False)
    id_eot_vmt_hex = Column(String, nullable=False)
    numero_terminal = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radio_geocerca_m = Column(Integer, nullable=False)
    geom_punto = Column(Geometry('POINT', srid=4326), nullable=False)
    geom_geocerca = Column(Geometry('POLYGON', srid=4326), nullable=True)
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
# ===== SISTEMA DE SEGURIDAD Y AUDITORÍA =====

class CatalogoRuta(Base):
    __tablename__ = "catalogo_rutas"

    ruta_hex = Column(String, primary_key=True, index=True)
    id_eot_catalogo = Column(Integer, nullable=True)
    ruta_gtfs = Column(Float, nullable=True)
    ruta_dec = Column(Integer, nullable=True)
    sentido = Column(String, nullable=True)
    linea = Column(String, nullable=True)
    ramal = Column(Integer, nullable=True)
    origen = Column(String, nullable=True)
    destino = Column(String, nullable=True)
    identificacion = Column(String, nullable=True)
    identificador_troncal = Column(String, nullable=True)
    observaciones = Column(String, nullable=True)
    par_id = Column(Integer, nullable=True)
    ingresa = Column(Integer, nullable=True)
    # La columna geom se almacena en la base de datos como tipo geometry (PostGIS).
    # Usamos geoalchemy2.Geometry para reflejar correctamente el tipo.
    geom = Column(Geometry('GEOMETRY', srid=4326), nullable=True)
    latitud_a = Column(Float, nullable=True)
    longitud_a = Column(Float, nullable=True)
    latitud_b = Column(Float, nullable=True)
    longitud_b = Column(Float, nullable=True)
    estado = Column(Boolean, nullable=True)

class LineaRutaCatalogo(Base):
    """
    Malla de Temporalidad (Modelo Final Sugerido)
    Vincula Líneas con Rutas del catálogo con vigencia temporal.
    """
    __tablename__ = "linea_ruta_catalogo"
    
    id_linea_ruta_catalogo = Column(Integer, primary_key=True, autoincrement=True)
    id_linea = Column(Integer, ForeignKey('lineas.id_linea'), nullable=False)
    ruta_hex = Column(String, ForeignKey('catalogo_rutas.ruta_hex'), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=True)
    
    linea = relationship("Linea", backref="vinculos_rutas")
    ruta = relationship("CatalogoRuta", backref="vinculos_lineas")


class HistoricoEotRuta(Base):
    """
    Historial de empresas (EOT) que operaron una ruta.

    Nota: la definición original propuesta usaba una FK a 'catalogo_rutas(id_ruta)'.
    En este código la tabla `catalogo_rutas` usa `ruta_hex` como clave primaria,
    por lo que enlazamos mediante `ruta_hex` (string). Si su esquema tiene
    `id_ruta` como entero, debe sincronizarse aquí.
    """
    __tablename__ = "historico_eot_ruta"

    id_hist_eot = Column(Integer, primary_key=True, autoincrement=True)
    ruta_hex = Column(String, ForeignKey('catalogo_rutas.ruta_hex'), nullable=False)
    id_eot = Column(Integer, ForeignKey('eots.eot_id'), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=True)
    observacion = Column(Text, nullable=True)

    # Relaciones convenientes
    eot = relationship("EOT", backref="historico_rutas")
    ruta = relationship("CatalogoRuta", backref="historico_eots")

class SistemaApp(Base):
    __tablename__ = "sistemas"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(String(200))
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    
    # Relaciones
    habilitaciones = relationship("UsuarioSistemaRol", back_populates="sistema")

class UsuarioSistemaRol(Base):
    __tablename__ = "usuario_sistema_rol"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=False)
    sistema_id = Column(Integer, ForeignKey('sistema.sistemas.id'), nullable=False)
    rol_id = Column(Integer, ForeignKey('sistema.roles.id'), nullable=False)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    
    usuario = relationship("Usuario", back_populates="habilitaciones_sistemas")
    sistema = relationship("SistemaApp", back_populates="habilitaciones")
    rol = relationship("Rol", back_populates="habilitaciones_usuarios")

class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    nombre_completo = Column(String(100), nullable=False)
    rol = Column(String(20), default='user')  # Mantener para compatibilidad
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    ultimo_acceso = Column(DateTime)
    creado_por = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)
    
    # Relaciones
    roles = relationship("Rol", secondary=usuario_rol, back_populates="usuarios")
    sesiones = relationship("SesionUsuario", back_populates="usuario")
    logs_acceso = relationship("LogAcceso", back_populates="usuario")
    logs_auditoria = relationship("LogAuditoria", back_populates="usuario")
    creador = relationship("Usuario", remote_side=[id])
    habilitaciones_sistemas = relationship("UsuarioSistemaRol", back_populates="usuario")

class Rol(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, index=True, nullable=False)
    descripcion = Column(String(200))
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    creado_por = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)
    
    # Relaciones
    usuarios = relationship("Usuario", secondary=usuario_rol, back_populates="roles")
    permisos = relationship("Permiso", secondary=rol_permiso, back_populates="roles")
    habilitaciones_usuarios = relationship("UsuarioSistemaRol", back_populates="rol")

class Permiso(Base):
    __tablename__ = "permisos"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, index=True, nullable=False)
    descripcion = Column(String(200))
    modulo = Column(String(50))  # gremios, eots, feriados, usuarios, etc.
    accion = Column(String(50))   # read, write, delete, manage_users, etc.
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    
    # Relaciones
    roles = relationship("Rol", secondary=rol_permiso, back_populates="permisos")

class SesionUsuario(Base):
    __tablename__ = "sesiones_usuarios"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=False)
    token = Column(String(500), unique=True, index=True, nullable=False)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    fecha_inicio = Column(DateTime, default=func.now())
    fecha_expiracion = Column(DateTime, nullable=False)
    activa = Column(Boolean, default=True)
    fecha_cierre = Column(DateTime)
    
    # Relaciones
    usuario = relationship("Usuario", back_populates="sesiones")

class PasswordReset(Base):
    __tablename__ = "password_resets"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), nullable=False)
    token = Column(String(255), unique=True, index=True, nullable=False)
    expira_en = Column(DateTime, nullable=False)
    usado = Column(Boolean, default=False)
    fecha_creacion = Column(DateTime, default=func.now())

class LogAcceso(Base):
    __tablename__ = "logs_acceso"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)
    username = Column(String(50), nullable=False)
    accion = Column(String(50), nullable=False)  # login, logout, failed_login
    ip_address = Column(String(45))
    user_agent = Column(Text)
    fecha = Column(DateTime, default=func.now())
    detalles = Column(JSON)
    exitoso = Column(Boolean, default=True)
    
    # Relaciones
    usuario = relationship("Usuario", back_populates="logs_acceso")

class LogAuditoria(Base):
    __tablename__ = "logs_auditoria"
    __table_args__ = {"schema": "sistema"}
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)
    username = Column(String(50), nullable=False)
    accion = Column(String(50), nullable=False)  # create, update, delete, export
    tabla = Column(String(50), nullable=False)   # gremios, eots, feriados, usuarios
    registro_id = Column(Integer, nullable=True)
    datos_anteriores = Column(JSON)
    datos_nuevos = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    fecha = Column(DateTime, default=func.now())
    detalles = Column(Text)
    
    # Relaciones
    usuario = relationship("Usuario", back_populates="logs_auditoria")

# ===== SISTEMA DE PARÁMETROS =====

class ParametroSistema(Base):
    __tablename__ = "parametros_sistema"
    
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(100), nullable=False)
    valor = Column(Text)
    tipo = Column(String(20), default='string')  # string, integer, float, boolean, json
    descripcion = Column(String(200))
    categoria = Column(String(50))  # seguridad, email, sistema, etc.
    editable = Column(Boolean, default=True)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    fecha_modificacion = Column(DateTime, onupdate=func.now())
    modificado_por = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)

class ConfiguracionEmail(Base):
    __tablename__ = "configuracion_email"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    host = Column(String(100), nullable=False)
    puerto = Column(Integer, nullable=False)
    username = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    from_email = Column(String(100), nullable=False)
    use_tls = Column(Boolean, default=True)
    use_ssl = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=func.now())
    creado_por = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)

# ===== SISTEMA DE NOTIFICACIONES =====

class Notificacion(Base):
    __tablename__ = "notificaciones"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=False)
    titulo = Column(String(100), nullable=False)
    mensaje = Column(Text, nullable=False)
    tipo = Column(String(20), default='info')  # info, warning, error, success
    leida = Column(Boolean, default=False)
    fecha_creacion = Column(DateTime, default=func.now())
    fecha_lectura = Column(DateTime)
    datos_adicionales = Column(JSON)

# ===== SISTEMA DE BACKUP Y VERSIONADO =====

class BackupSistema(Base):
    __tablename__ = "backups_sistema"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text)
    ruta_archivo = Column(String(500), nullable=False)
    tamano_bytes = Column(Integer)
    tipo = Column(String(20), default='completo')  # completo, incremental, diferencial
    estado = Column(String(20), default='en_proceso')  # en_proceso, completado, fallido
    fecha_inicio = Column(DateTime, default=func.now())
    fecha_fin = Column(DateTime)
    creado_por = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=True)
    detalles = Column(JSON)

# ===== SISTEMA DE REPORTES =====

class Reporte(Base):
    __tablename__ = "reportes"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text)
    tipo = Column(String(20), nullable=False)  # pdf, excel, csv, html
    parametros = Column(JSON)
    fecha_creacion = Column(DateTime, default=func.now())
    fecha_ejecucion = Column(DateTime)
    estado = Column(String(20), default='pendiente')  # pendiente, ejecutando, completado, fallido
    ruta_archivo = Column(String(500))
    creado_por = Column(Integer, ForeignKey('sistema.usuarios.id'), nullable=False)
    detalles = Column(JSON)


# ===== SERVICIOS ESPECIALES (schema servicios_especiales) =====

class ServicioEspecial(Base):
    """Identificación de servicios especiales (Búho 1, Eléctrico 1, etc.)."""
    __tablename__ = "servicio_especial"
    __table_args__ = {"schema": "servicios_especiales"}

    id_servicio_especial = Column(Integer, primary_key=True, autoincrement=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True)  # E1, B1, Búho 1
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AdjudicacionServicio(Base):
    """Asignación de un servicio especial a una EOT durante un periodo (inicio/fin de servicio)."""
    __tablename__ = "adjudicacion_servicio"
    __table_args__ = {"schema": "servicios_especiales"}

    id_adjudicacion = Column(Integer, primary_key=True, autoincrement=True)
    id_servicio_especial = Column(Integer, ForeignKey("servicios_especiales.servicio_especial.id_servicio_especial"), nullable=False)
    id_eot = Column(Integer, ForeignKey("eots.eot_id"), nullable=False)
    fecha_inicio_servicio = Column(Date, nullable=False)
    fecha_fin_servicio = Column(Date, nullable=True)
    observacion = Column(Text, nullable=True)
    link_dashboard = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, server_default=func.now())

    servicio_especial = relationship("ServicioEspecial", backref="adjudicaciones")
    eot = relationship("EOT", backref="adjudicaciones_servicios_especiales")


class BusAdjudicacion(Base):
    """Buses asignados a una adjudicación: número de orden e idsam (SNBE)."""
    __tablename__ = "bus_adjudicacion"
    __table_args__ = {"schema": "servicios_especiales"}

    id_bus_adjudicacion = Column(Integer, primary_key=True, autoincrement=True)
    id_adjudicacion = Column(Integer, ForeignKey("servicios_especiales.adjudicacion_servicio.id_adjudicacion"), nullable=False)
    numero_orden = Column(Integer, nullable=False)
    idsam = Column(String(100), nullable=False)  # ID en SNBE
    mean_id = Column(String(50), nullable=True)  # Número de bus en sistema monitoreo (00020, 00023, etc.)

    adjudicacion = relationship("AdjudicacionServicio", backref="buses")


class RutaServicioEspecial(Base):
    """Ruta(s) del catálogo asignada(s) al servicio (ida/vuelta). Itinerarios vigentes en historico_itinerario."""
    __tablename__ = "ruta_servicio_especial"
    __table_args__ = {"schema": "servicios_especiales"}

    id_ruta_servicio = Column(Integer, primary_key=True, autoincrement=True)
    id_servicio_especial = Column(Integer, ForeignKey("servicios_especiales.servicio_especial.id_servicio_especial"), nullable=False)
    ruta_hex = Column(String, ForeignKey("catalogo_rutas.ruta_hex"), nullable=False)
    sentido = Column(String(20), nullable=False)  # ida | vuelta
    vigente_desde = Column(Date, nullable=True)
    vigente_hasta = Column(Date, nullable=True)

    servicio_especial = relationship("ServicioEspecial", backref="rutas")
    ruta = relationship("CatalogoRuta", backref="servicios_especiales_asignados")



class ProgramacionOperativa(Base):
    """Programación operativa: hora de salida/llegada por número de servicio y sentido. Tiene vigencia (un mes una programación, otro mes otra)."""
    __tablename__ = "programacion_operativa"
    __table_args__ = {"schema": "servicios_especiales"}

    id_programacion = Column(Integer, primary_key=True, autoincrement=True)
    id_servicio_especial = Column(Integer, ForeignKey("servicios_especiales.servicio_especial.id_servicio_especial"), nullable=False)
    fecha_inicio_vigencia = Column(Date, nullable=False)  # Vigencia: desde esta fecha
    fecha_fin_vigencia = Column(Date, nullable=True)       # Vigencia: hasta esta fecha (null = indefinido)
    numero_servicio = Column(Integer, nullable=False)     # 1, 2, 3...
    sentido = Column(String(20), nullable=False)          # ida | vuelta
    horario_salida = Column(Time, nullable=False)
    horario_llegada = Column(Time, nullable=True)
    tipo_dia = Column(Integer, ForeignKey("control_metricas.tipo_dia.id_tipo_dia"), default=5, nullable=True) # 5=Laboral

    servicio_especial = relationship("ServicioEspecial", backref="programaciones")


class ParametroMonitoreo(Base):
    """Parámetros de monitoreo por servicio especial (radio geocerca, cumplimiento, franja horaria, etc.)."""
    __tablename__ = "parametro_monitoreo"
    __table_args__ = {"schema": "servicios_especiales"}

    id_parametro = Column(Integer, primary_key=True, autoincrement=True)
    id_servicio_especial = Column(Integer, ForeignKey("servicios_especiales.servicio_especial.id_servicio_especial"), nullable=False)
    radio_geocerca_m = Column(Integer, default=100, nullable=False)
    radio_itinerario_m = Column(Integer, default=50, nullable=False)
    rango_cumplimiento_pct = Column(Integer, default=80, nullable=False)
    franja_hora_inicio = Column(String(10), nullable=False)  # 21:30:00
    franja_hora_fin = Column(String(10), nullable=False)    # 07:30:00 (día siguiente)
    tolerancia_antes_min = Column(Integer, default=5, nullable=False)
    tolerancia_despues_min = Column(Integer, default=10, nullable=False)
    emisor_id = Column(Integer, nullable=True)  # Para query monitoreo
    agency_ids = Column(Text, nullable=True)   # JSON array o texto: '0006', 'GRUPO BENE S.A.'
    pasa_al_dia_siguiente = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())

    servicio_especial = relationship("ServicioEspecial", backref="parametros_monitoreo")

class ParadaOficial(Base):
    __tablename__ = "paradas_oficiales"
    __table_args__ = {"schema": "geometria"}
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(String, nullable=True)
    source_name = Column(String, nullable=True)
    attrs = Column(JSON, nullable=False)
    geom = Column(Geometry('POINT', srid=4326), nullable=False)
    bearing = Column(Float, default=0.0)
    
    # Campos GTFS
    location_type = Column(Integer, default=0) # 0=Stop, 1=Station, 2=Entrance/Exit, 3=Generic Node, 4=Boarding Area
    parent_station = Column(String, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())

    # Relación con itinerarios
    itinerarios = relationship("HistoricoItinerario", secondary="geometria.itinerario_parada", back_populates="paradas")

# ===== CONTROL MÉTRICAS (schema control_metricas) =====

class TipoDia(Base):
    __tablename__ = "tipo_dia"
    __table_args__ = {"schema": "control_metricas"}
    
    id_tipo_dia = Column(Integer, primary_key=True)
    codigo = Column(String(50), nullable=False)
    descripcion = Column(String(200), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)

class DiaAtipico(Base):
    __tablename__ = "dias_atipicos"
    __table_args__ = {"schema": "control_metricas"}
    
    fecha = Column(Date, primary_key=True)
    tipo_atipico = Column(String(100), nullable=False)
    factor_exigencia = Column(Float, nullable=False) # numeric
    descartar_historico = Column(Boolean, default=False, nullable=False)
    fuente_dato = Column(String(200))
    observacion = Column(Text)
    id_tipo_dia_aplicable = Column(Integer, ForeignKey("control_metricas.tipo_dia.id_tipo_dia"))
    
    tipo_dia = relationship("TipoDia")

class FranjaOperativa(Base):
    __tablename__ = "franjas_operativas"
    __table_args__ = {"schema": "control_metricas"}
    
    id_franja = Column(Integer, primary_key=True, autoincrement=True)
    denominacion = Column(String(100), nullable=False)
    hora_inicio = Column(Time, nullable=False)
    hora_fin = Column(Time, nullable=False)
    id_tipo_dia = Column(Integer, ForeignKey("control_metricas.tipo_dia.id_tipo_dia"), nullable=False)
    inicio_vigencia = Column(Date, nullable=False)
    fin_vigencia = Column(Date)
    activo = Column(Boolean, default=True, nullable=False)
    
    tipo_dia = relationship("TipoDia")

class ItinerarioParada(Base):
    __tablename__ = "itinerario_parada"
    __table_args__ = {"schema": "geometria"}
    
    id_itinerario = Column(Integer, ForeignKey('geometria.historico_itinerario.id_itinerario'), primary_key=True)
    id_parada = Column(Integer, ForeignKey('geometria.paradas_oficiales.id'), primary_key=True)
    orden = Column(Integer)
    
    itinerario = relationship("HistoricoItinerario", backref=backref("parada_links", cascade="all, delete-orphan"), overlaps="itinerarios,paradas")
    parada = relationship("ParadaOficial", backref=backref("itinerario_links", cascade="all, delete-orphan"))