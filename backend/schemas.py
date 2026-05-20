# schemas.py
# Esquemas Pydantic para validación de datos

from pydantic import BaseModel, EmailStr, validator, field_serializer
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, date, time
from enum import Enum

# ===== ENUMS =====

class TipoUsuario(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"
    VIEWER = "viewer"

class TipoAccion(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    READ = "read"
    EXPORT = "export"
    LOGIN = "login"
    LOGOUT = "logout"

class TipoNotificacion(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"

# ===== SCHEMAS DE AUTENTICACIÓN =====

class UserLogin(BaseModel):
    username: str
    password: str

class HabilitacionCreate(BaseModel):
    sistema_id: int
    rol: str

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    nombre_completo: str
    rol: str = "user"
    habilitaciones: List[HabilitacionCreate] = []
    
    @validator('username')
    def username_must_be_valid(cls, v):
        if len(v) < 3:
            raise ValueError('El nombre de usuario debe tener al menos 3 caracteres')
        if not v.isalnum():
            raise ValueError('El nombre de usuario solo puede contener letras y números')
        return v

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    nombre_completo: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    habilitaciones: Optional[List[HabilitacionCreate]] = None

class SistemaAppCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True

class SistemaAppUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None

class SistemaAppResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool
    
    class Config:
        from_attributes = True

class UsuarioSistemaRolResponse(BaseModel):
    id: int
    sistema_id: int
    rol_id: int
    activo: bool
    rol_nombre: Optional[str] = None

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    nombre_completo: str
    rol: str
    activo: bool
    fecha_creacion: datetime
    ultimo_acceso: Optional[datetime] = None
    habilitaciones_sistemas: List[UsuarioSistemaRolResponse] = []
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ===== SCHEMAS DE CONTRASEÑAS =====

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
    
    @validator('new_password')
    def password_must_be_strong(cls, v):
        if len(v) < 8:
            raise ValueError('La contraseña debe tener al menos 8 caracteres')
        if not any(c.isupper() for c in v):
            raise ValueError('La contraseña debe contener al menos una mayúscula')
        if not any(c.islower() for c in v):
            raise ValueError('La contraseña debe contener al menos una minúscula')
        if not any(c.isdigit() for c in v):
            raise ValueError('La contraseña debe contener al menos un número')
        return v

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
    
    @validator('new_password')
    def password_must_be_strong(cls, v):
        if len(v) < 8:
            raise ValueError('La contraseña debe tener al menos 8 caracteres')
        if not any(c.isupper() for c in v):
            raise ValueError('La contraseña debe contener al menos una mayúscula')
        if not any(c.islower() for c in v):
            raise ValueError('La contraseña debe contener al menos una minúscula')
        if not any(c.isdigit() for c in v):
            raise ValueError('La contraseña debe contener al menos un número')
        return v

# ===== SCHEMAS DE ROLES Y PERMISOS =====

class RolCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    permisos: List[int] = []  # IDs de permisos

class RolUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None
    permisos: Optional[List[int]] = None

class RolResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool
    fecha_creacion: datetime
    permisos: List['PermisoResponse'] = []
    
    class Config:
        from_attributes = True

class PermisoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    modulo: str
    accion: str

class PermisoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    modulo: Optional[str] = None
    accion: Optional[str] = None
    activo: Optional[bool] = None

class PermisoResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    modulo: str
    accion: str
    activo: bool
    fecha_creacion: datetime
    
    class Config:
        from_attributes = True

# ===== SCHEMAS DE AUDITORÍA =====

class LogAccesoCreate(BaseModel):
    username: str
    accion: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    exitoso: bool = True
    detalles: Optional[Dict[str, Any]] = None

class LogAccesoResponse(BaseModel):
    id: int
    usuario_id: Optional[int] = None
    username: str
    accion: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    fecha: datetime
    exitoso: bool
    detalles: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class LogAuditoriaCreate(BaseModel):
    username: str
    accion: str
    tabla: str
    registro_id: Optional[int] = None
    datos_anteriores: Optional[Dict[str, Any]] = None
    datos_nuevos: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    detalles: Optional[str] = None

class LogAuditoriaResponse(BaseModel):
    id: int
    usuario_id: Optional[int] = None
    username: str
    accion: str
    tabla: str
    registro_id: Optional[int] = None
    datos_anteriores: Optional[Dict[str, Any]] = None
    datos_nuevos: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    fecha: datetime
    detalles: Optional[str] = None
    
    class Config:
        from_attributes = True

# ===== SCHEMAS DE PARÁMETROS =====

class ParametroSistemaCreate(BaseModel):
    codigo: str
    nombre: str
    valor: str
    tipo: str = "string"
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    editable: bool = True

class ParametroSistemaUpdate(BaseModel):
    nombre: Optional[str] = None
    valor: Optional[str] = None
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    editable: Optional[bool] = None
    activo: Optional[bool] = None

class ParametroSistemaResponse(BaseModel):
    id: int
    codigo: str
    nombre: str
    valor: str
    tipo: str
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    editable: bool
    activo: bool
    fecha_creacion: datetime
    fecha_modificacion: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# ===== SCHEMAS DE NOTIFICACIONES =====

class NotificacionCreate(BaseModel):
    usuario_id: int
    titulo: str
    mensaje: str
    tipo: TipoNotificacion = TipoNotificacion.INFO
    datos_adicionales: Optional[Dict[str, Any]] = None

class NotificacionUpdate(BaseModel):
    leida: Optional[bool] = None

class NotificacionResponse(BaseModel):
    id: int
    usuario_id: int
    titulo: str
    mensaje: str
    tipo: str
    leida: bool
    fecha_creacion: datetime
    fecha_lectura: Optional[datetime] = None
    datos_adicionales: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

# ===== SCHEMAS DE REPORTES =====

class ReporteCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    tipo: str
    parametros: Optional[Dict[str, Any]] = None

class ReporteResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    tipo: str
    parametros: Optional[Dict[str, Any]] = None
    fecha_creacion: datetime
    fecha_ejecucion: Optional[datetime] = None
    estado: str
    ruta_archivo: Optional[str] = None
    creado_por: int
    detalles: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

# ===== SCHEMAS DE UTILIDAD =====

class RoleInfo(BaseModel):
    role: str
    permissions: List[str]

class PermissionCheck(BaseModel):
    permission: str
    has_permission: bool

# ===== SCHEMAS DE MODELOS EXISTENTES =====

class GremioCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class GremioUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None

class GremioResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    fecha_creacion: datetime
    activo: bool
    
    class Config:
        from_attributes = True

class EOTBase(BaseModel):
    eot_nombre: str
    eot_linea: Optional[str] = None
    cod_catalogo: Optional[int] = None
    cod_planilla: Optional[str] = None
    cod_epas: Optional[str] = None
    cod_tdp: Optional[str] = None
    situacion: Optional[int] = 0
    gre_id: Optional[int] = 0
    autorizado: Optional[int] = 0
    operativo: Optional[int] = 0
    reserva: Optional[int] = 0
    permisionario: Optional[bool] = False
    operativo_declarado: Optional[int] = 0
    reserva_declarada: Optional[int] = 0
    id_eot_vmt_hex: Optional[str] = None
    e_mail: Optional[str] = None
    eot_UF: Optional[bool] = False
    id_tipo_eot: Optional[int] = None
    agency_timezone: str = "America/Asuncion"
    agency_url: Optional[str] = None
    agency_lang: str = "es"

class EOTCreate(EOTBase):
    pass

class EOTUpdate(BaseModel):
    eot_nombre: Optional[str] = None
    eot_linea: Optional[str] = None
    cod_catalogo: Optional[int] = None
    cod_planilla: Optional[str] = None
    cod_epas: Optional[str] = None
    cod_tdp: Optional[str] = None
    situacion: Optional[int] = None
    gre_id: Optional[int] = None
    autorizado: Optional[int] = None
    operativo: Optional[int] = None
    reserva: Optional[int] = None
    permisionario: Optional[bool] = None
    operativo_declarado: Optional[int] = None
    reserva_declarada: Optional[int] = None
    id_eot_vmt_hex: Optional[str] = None
    e_mail: Optional[str] = None
    eot_UF: Optional[bool] = None
    id_tipo_eot: Optional[int] = None
    agency_timezone: Optional[str] = None
    agency_url: Optional[str] = None
    agency_lang: Optional[str] = None

class EOTResponse(EOTBase):
    eot_id: int
    
    class Config:
        from_attributes = True

# ===== SCHEMAS UF Y CONSORCIOS =====

class TipoEOTCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class TipoEOTResponse(BaseModel):
    id_tipo: int
    nombre: str
    descripcion: Optional[str] = None
    
    class Config:
        from_attributes = True

class UnidadFuncionalCreate(BaseModel):
    nombre_uf: str
    tipo_uf: Optional[str] = None
    estado: bool = True

class UnidadFuncionalUpdate(BaseModel):
    nombre_uf: Optional[str] = None
    tipo_uf: Optional[str] = None
    estado: Optional[bool] = None

class UnidadFuncionalResponse(BaseModel):
    id_uf: int
    nombre_uf: str
    tipo_uf: Optional[str] = None
    estado: bool
    fecha_creacion: datetime
    
    class Config:
        from_attributes = True

class UFTroncalCreate(BaseModel):
    id_uf: int
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    geom: Union[str, Dict[str, Any]]
    color_hex: Optional[str] = '#FF0000'
    es_principal: bool = False
    activo: bool = True

class UFTroncalUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    geom: Optional[Union[str, Dict[str, Any]]] = None
    color_hex: Optional[str] = None
    es_principal: Optional[bool] = None
    activo: Optional[bool] = None

class UFTroncalResponse(BaseModel):
    id_troncal: int
    id_uf: int
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    geom: Any
    geom_geocerca: Optional[Any] = None
    color_hex: str
    es_principal: bool
    activo: bool
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    
    class Config:
        from_attributes = True

class ComposicionUFCreate(BaseModel):
    id_uf: int
    ruta_hex: str
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    resolucion_legal: Optional[str] = None

class ComposicionUFResponse(BaseModel):
    id_composicion_uf: int
    id_uf: int
    ruta_hex: str
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    resolucion_legal: Optional[str] = None
    cobertura_pct: Optional[float] = None
    
    class Config:
        from_attributes = True

class ComposicionConsorcioCreate(BaseModel):
    id_consorcio: int
    id_eot: int
    participacion_pct: Optional[float] = None
    es_lider: Optional[bool] = False
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    observaciones: Optional[str] = None

class ComposicionConsorcioResponse(BaseModel):
    id_comp_cons: int
    id_consorcio: int
    id_eot: int
    participacion_pct: Optional[float] = None
    es_lider: bool
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    observaciones: Optional[str] = None
    
    class Config:
        from_attributes = True

class TipoEOTUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None

class FeriadoCreate(BaseModel):
    fecha: date
    dia: Optional[str] = None
    nrodiasemana: Optional[int] = None
    descripcion: Optional[str] = None
    observacion: Optional[str] = None

class FeriadoUpdate(BaseModel):
    dia: Optional[str] = None
    nrodiasemana: Optional[int] = None
    descripcion: Optional[str] = None
    observacion: Optional[str] = None

class FeriadoResponse(BaseModel):
    fecha: date
    dia: Optional[str] = None
    nrodiasemana: Optional[int] = None
    descripcion: Optional[str] = None
    observacion: Optional[str] = None
    
    class Config:
        from_attributes = True

class LineaBase(BaseModel):
    numero_linea: str
    nombre_comercial: Optional[str] = None
    estado: Optional[bool] = True
    identificador_troncal: Optional[str] = None
    id_uf: Optional[int] = None
    color_hex: Optional[str] = '#3B82F6'
    route_type: int = 3
    route_text_color: str = '#FFFFFF'

class LineaCreate(LineaBase):
    pass

class LineaUpdate(BaseModel):
    numero_linea: Optional[str] = None
    nombre_comercial: Optional[str] = None
    estado: Optional[bool] = None
    identificador_troncal: Optional[str] = None
    id_uf: Optional[int] = None
    color_hex: Optional[str] = None
    route_type: Optional[int] = None
    route_text_color: Optional[str] = None

class LineaResponse(LineaBase):
    id_linea: int
    creado_en: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class LineaRutaCatalogoBase(BaseModel):
    id_linea: int
    ruta_hex: str
    fecha_inicio: date
    fecha_fin: Optional[date] = None

class LineaRutaCatalogoCreate(LineaRutaCatalogoBase):
    pass

class LineaRutaCatalogoUpdate(BaseModel):
    id_linea: Optional[int] = None
    ruta_hex: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None

class LineaRutaCatalogoResponse(LineaRutaCatalogoBase):
    id_linea_ruta_catalogo: int
    
    class Config:
        from_attributes = True

# ===== SCHEMAS DE CATÁLOGO DE RUTAS =====
from typing import Optional

class CatalogoRutaBase(BaseModel):
    ruta_hex: str
    id_eot_catalogo: Optional[int] = None
    ruta_gtfs: Optional[float] = None
    ruta_dec: Optional[int] = None
    sentido: Optional[str] = None
    linea: Optional[str] = None
    ramal: Optional[int] = None
    origen: Optional[str] = None
    destino: Optional[str] = None
    identificacion: Optional[str] = None
    identificador_troncal: Optional[str] = None
    observaciones: Optional[str] = None
    par_id: Optional[int] = None
    ingresa: Optional[int] = None
    # geom puede ser una cadena (WKT/JSON) o un objeto GeoJSON (dict) enviado desde el frontend
    geom: Optional[Union[str, Dict[str, Any]]] = None
    latitud_a: Optional[float] = None
    longitud_a: Optional[float] = None
    latitud_b: Optional[float] = None
    longitud_b: Optional[float] = None
    estado: Optional[bool] = None

class CatalogoRutaCreate(CatalogoRutaBase):
    pass

class CatalogoRutaUpdate(BaseModel):
    id_eot_catalogo: Optional[int] = None
    ruta_gtfs: Optional[float] = None
    ruta_dec: Optional[int] = None
    sentido: Optional[str] = None
    linea: Optional[str] = None
    ramal: Optional[int] = None
    origen: Optional[str] = None
    destino: Optional[str] = None
    identificacion: Optional[str] = None
    identificador_troncal: Optional[str] = None
    observaciones: Optional[str] = None
    par_id: Optional[int] = None
    ingresa: Optional[int] = None
    geom: Optional[Union[str, Dict[str, Any]]] = None
    latitud_a: Optional[float] = None
    longitud_a: Optional[float] = None
    latitud_b: Optional[float] = None
    longitud_b: Optional[float] = None
    estado: Optional[bool] = None

# === HISTÓRICO DE ITINERARIOS ===
from typing import Union, Dict, Any

class HistoricoItinerarioBase(BaseModel):
    ruta_hex: str
    fecha_inicio_vigencia: date
    fecha_fin_vigencia: Optional[date] = None
    geom: Optional[Union[str, Dict[str, Any]]] = None  # Puede ser GeoJSON (como diccionario) o WKT (como string)
    vigente: bool = True
    observacion: Optional[str] = None

class HistoricoItinerarioCreate(HistoricoItinerarioBase):
    pass

class HistoricoItinerarioUpdate(BaseModel):
    fecha_inicio_vigencia: Optional[date] = None
    fecha_fin_vigencia: Optional[date] = None
    geom: Optional[Union[str, Dict[str, Any]]] = None
    vigente: Optional[bool] = None
    observacion: Optional[str] = None

class HistoricoItinerarioResponse(HistoricoItinerarioBase):
    id_itinerario: int
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    class Config:
        from_attributes = True


# ===== HISTORICO EOT POR RUTA =====
class HistoricoEotRutaBase(BaseModel):
    ruta_hex: str
    id_eot: int
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    observacion: Optional[str] = None

class HistoricoEotRutaCreate(HistoricoEotRutaBase):
    pass

class HistoricoEotRutaUpdate(BaseModel):
    fecha_fin: Optional[date] = None
    observacion: Optional[str] = None

class HistoricoEotRutaResponse(HistoricoEotRutaBase):
    id_hist_eot: int

    class Config:
        from_attributes = True

class CatalogoRutaResponse(CatalogoRutaBase):
    class Config:
        from_attributes = True

# ===== GEOCERCAS Y TERMINALES =====

class TipoGeocercaResponse(BaseModel):
    id_tipo: int
    nombre: str
    descripcion: Optional[str] = None
    
    class Config:
        from_attributes = True

class GeocercaBase(BaseModel):
    id_itinerario: int
    id_tipo: int
    orden: int = 0
    geom: Optional[Union[str, Dict[str, Any]]] = None

class GeocercaCreate(GeocercaBase):
    pass

class GeocercaUpdate(BaseModel):
    id_tipo: Optional[int] = None
    orden: Optional[int] = None
    geom: Optional[Union[str, Dict[str, Any]]] = None

class GeocercaResponse(GeocercaBase):
    id_geocerca: int
    tipo: Optional[TipoGeocercaResponse] = None
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class PuntoTerminalBase(BaseModel):
    id_tipo_geocerca: int
    id_eot_vmt_hex: str
    numero_terminal: str
    latitude: float
    longitude: float
    radio_geocerca_m: int
    geom_punto: Optional[Union[str, Dict[str, Any]]] = None
    geom_geocerca: Optional[Union[str, Dict[str, Any]]] = None

class PuntoTerminalCreate(PuntoTerminalBase):
    pass

class PuntoTerminalUpdate(BaseModel):
    id_tipo_geocerca: Optional[int] = None
    numero_terminal: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radio_geocerca_m: Optional[int] = None
    geom_punto: Optional[Union[str, Dict[str, Any]]] = None
    geom_geocerca: Optional[Union[str, Dict[str, Any]]] = None

class PuntoTerminalResponse(PuntoTerminalBase):
    id_punto: int
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ===== SERVICIOS ESPECIALES =====

class ServicioEspecialCreate(BaseModel):
    codigo: str
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True

class ServicioEspecialUpdate(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None

class ServicioEspecialResponse(BaseModel):
    id_servicio_especial: int
    codigo: str
    nombre: str
    descripcion: Optional[str] = None
    activo: bool
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    class Config:
        from_attributes = True


class AdjudicacionServicioCreate(BaseModel):
    id_servicio_especial: int
    id_eot: int
    fecha_inicio_servicio: date
    fecha_fin_servicio: Optional[date] = None
    observacion: Optional[str] = None
    link_dashboard: Optional[str] = None

class AdjudicacionServicioUpdate(BaseModel):
    id_eot: Optional[int] = None
    fecha_inicio_servicio: Optional[date] = None
    fecha_fin_servicio: Optional[date] = None
    observacion: Optional[str] = None
    link_dashboard: Optional[str] = None

class AdjudicacionServicioResponse(BaseModel):
    id_adjudicacion: int
    id_servicio_especial: int
    id_eot: int
    fecha_inicio_servicio: date
    fecha_fin_servicio: Optional[date] = None
    observacion: Optional[str] = None
    link_dashboard: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    class Config:
        from_attributes = True


class BusAdjudicacionCreate(BaseModel):
    id_adjudicacion: int
    numero_orden: int
    idsam: str
    mean_id: Optional[str] = None

class BusAdjudicacionUpdate(BaseModel):
    numero_orden: Optional[int] = None
    idsam: Optional[str] = None
    mean_id: Optional[str] = None

class BusAdjudicacionResponse(BaseModel):
    id_bus_adjudicacion: int
    id_adjudicacion: int
    numero_orden: int
    idsam: str
    mean_id: Optional[str] = None
    class Config:
        from_attributes = True


class RutaServicioEspecialCreate(BaseModel):
    id_servicio_especial: int
    ruta_hex: str
    sentido: str  # ida | vuelta
    vigente_desde: Optional[date] = None
    vigente_hasta: Optional[date] = None

class RutaServicioEspecialUpdate(BaseModel):
    ruta_hex: Optional[str] = None
    sentido: Optional[str] = None
    vigente_desde: Optional[date] = None
    vigente_hasta: Optional[date] = None

class RutaServicioEspecialResponse(BaseModel):
    id_ruta_servicio: int
    id_servicio_especial: int
    ruta_hex: str
    sentido: str
    vigente_desde: Optional[date] = None
    vigente_hasta: Optional[date] = None
    class Config:
        from_attributes = True


class ProgramacionOperativaCreate(BaseModel):
    id_servicio_especial: int
    fecha_inicio_vigencia: date
    fecha_fin_vigencia: Optional[date] = None
    numero_servicio: int
    sentido: str
    horario_salida: str  # "HH:MM:SS"
    horario_llegada: Optional[str] = None
    tipo_dia: Optional[int] = 5

class ProgramacionOperativaUpdate(BaseModel):
    fecha_inicio_vigencia: Optional[date] = None
    fecha_fin_vigencia: Optional[date] = None
    numero_servicio: Optional[int] = None
    sentido: Optional[str] = None
    horario_salida: Optional[str] = None
    horario_llegada: Optional[str] = None
    tipo_dia: Optional[int] = None

class ProgramacionOperativaResponse(BaseModel):
    id_programacion: int
    id_servicio_especial: int
    fecha_inicio_vigencia: date
    fecha_fin_vigencia: Optional[date] = None
    numero_servicio: int
    sentido: str
    horario_salida: Optional[time] = None
    horario_llegada: Optional[time] = None
    tipo_dia: Optional[int] = None
    class Config:
        from_attributes = True
    @field_serializer("horario_salida", "horario_llegada")
    def serialize_time(self, v):
        return v.strftime("%H:%M:%S") if v else None


class ParametroMonitoreoCreate(BaseModel):
    id_servicio_especial: int
    radio_geocerca_m: int = 100
    radio_itinerario_m: int = 50
    rango_cumplimiento_pct: int = 80
    franja_hora_inicio: str = "21:30:00"
    franja_hora_fin: str = "07:30:00"
    tolerancia_antes_min: int = 5
    tolerancia_despues_min: int = 10
    emisor_id: Optional[int] = None
    agency_ids: Optional[str] = None
    pasa_al_dia_siguiente: bool = False
    activo: bool = True

class ParametroMonitoreoUpdate(BaseModel):
    radio_geocerca_m: Optional[int] = None
    radio_itinerario_m: Optional[int] = None
    rango_cumplimiento_pct: Optional[int] = None
    franja_hora_inicio: Optional[str] = None
    franja_hora_fin: Optional[str] = None
    tolerancia_antes_min: Optional[int] = None
    tolerancia_despues_min: Optional[int] = None
    emisor_id: Optional[int] = None
    agency_ids: Optional[str] = None
    pasa_al_dia_siguiente: Optional[bool] = None
    activo: Optional[bool] = None

class ParametroMonitoreoResponse(BaseModel):
    id_parametro: int
    id_servicio_especial: int
    radio_geocerca_m: int
    radio_itinerario_m: int
    rango_cumplimiento_pct: int
    franja_hora_inicio: str
    franja_hora_fin: str
    tolerancia_antes_min: int
    tolerancia_despues_min: int
    emisor_id: Optional[int] = None
    agency_ids: Optional[str] = None
    pasa_al_dia_siguiente: bool
    activo: bool
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    class Config:
        from_attributes = True

# ===== PARADAS OFICIALES =====

class ParadaOficialBase(BaseModel):
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    attrs: Dict[str, Any] = {}
    geom: Optional[Union[str, Dict[str, Any]]] = None
    bearing: float = 0.0
    location_type: int = 0
    parent_station: Optional[str] = None
    lineas_vinculadas: Optional[str] = None

class ParadaOficialCreate(ParadaOficialBase):
    pass

class ParadaOficialUpdate(BaseModel):
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    attrs: Optional[Dict[str, Any]] = None
    geom: Optional[Union[str, Dict[str, Any]]] = None
    bearing: Optional[float] = None
    location_type: Optional[int] = None
    parent_station: Optional[str] = None

class ParadaOficialResponse(ParadaOficialBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
# ===== ITINERARIO PARADA =====

class ItinerarioParadaBase(BaseModel):
    id_itinerario: int
    id_parada: int
    orden: int

class ItinerarioParadaCreate(ItinerarioParadaBase):
    pass

class ItinerarioParadaUpdate(BaseModel):
    orden: Optional[int] = None

class ParadaConOrden(ParadaOficialResponse):
    orden: int

class ItinerarioConParadas(BaseModel):
    id_itinerario: int
    paradas: List[ParadaConOrden]

# ===== CONTROL MÉTRICAS SCHEMAS =====

class TipoDiaBase(BaseModel):
    codigo: str
    descripcion: str
    activo: bool = True

class TipoDiaCreate(TipoDiaBase):
    id_tipo_dia: int # Se ingresa manualmente según el sistema legado

class TipoDiaUpdate(BaseModel):
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None

class TipoDiaResponse(TipoDiaBase):
    id_tipo_dia: int
    class Config:
        from_attributes = True

class DiaAtipicoBase(BaseModel):
    fecha: date
    tipo_atipico: str
    factor_exigencia: float
    descartar_historico: bool = False
    fuente_dato: Optional[str] = None
    observacion: Optional[str] = None
    id_tipo_dia_aplicable: Optional[int] = None

class DiaAtipicoCreate(DiaAtipicoBase):
    pass

class DiaAtipicoUpdate(BaseModel):
    tipo_atipico: Optional[str] = None
    factor_exigencia: Optional[float] = None
    descartar_historico: Optional[bool] = None
    fuente_dato: Optional[str] = None
    observacion: Optional[str] = None
    id_tipo_dia_aplicable: Optional[int] = None

class DiaAtipicoResponse(DiaAtipicoBase):
    tipo_dia: Optional[TipoDiaResponse] = None
    class Config:
        from_attributes = True

class FranjaOperativaBase(BaseModel):
    denominacion: str
    hora_inicio: time
    hora_fin: time
    id_tipo_dia: int
    inicio_vigencia: date
    fin_vigencia: Optional[date] = None
    activo: bool = True

class FranjaOperativaCreate(FranjaOperativaBase):
    pass

class FranjaOperativaUpdate(BaseModel):
    denominacion: Optional[str] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None
    id_tipo_dia: Optional[int] = None
    inicio_vigencia: Optional[date] = None
    fin_vigencia: Optional[date] = None
    activo: Optional[bool] = None

class FranjaOperativaResponse(FranjaOperativaBase):
    id_franja: int
    tipo_dia: Optional[TipoDiaResponse] = None
    class Config:
        from_attributes = True

class OSRMRouteRequest(BaseModel):
    coords: str
