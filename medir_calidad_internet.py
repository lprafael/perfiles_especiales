#!/usr/bin/env python3
"""
Monitor de Calidad de Internet (Windows + Linux) con escritura DURABLE (flush + fsync)
-----------------------------------------------------------------------------------

- Horario oficial: Lunes–Sábado 07:00–18:00 (hora local)
- Ejecutar en PC siempre encendida por 1 o varias semanas
- Registrar métricas en CSV para sustentar reclamos sobre calidad de Internet

Métricas por intervalo:
- Ping (ICMP) a varios destinos: pérdida, min/avg/max (ms) y jitter aprox.
- Tiempo de resolución DNS (ms)
- Tiempo HTTP(S) GET (ms) + status

IMPORTANTE (obligatorio):
1) Reemplace el primer destino de ping por el gateway real (router/firewall).
   Ejemplos típicos NO confiables: 192.168.0.1 / 192.168.1.1 / 10.0.0.1

Salida:
- CSV: ./internet_measurements/internet_quality.csv
- LOG: ./internet_measurements/internet_quality.log (rotativo)

Durabilidad:
- Cada fila escrita en CSV hace flush() + os.fsync() inmediatamente.
  Esto minimiza pérdida de evidencia ante apagón o cuelgue.
"""

from __future__ import annotations

import csv
import datetime as dt
import os
import platform
import socket
import subprocess
import time
import traceback
import urllib.request
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple
import logging
from logging.handlers import RotatingFileHandler
import re
import statistics


# =========================
# Configuración
# =========================

@dataclass
class Config:
    # Horario oficial
    start_hour: int = 7
    end_hour: int = 18  # inclusivo a las 18:00 exactas

    # Intervalo en horario oficial
    interval_seconds: int = 300  # 5 minutos

    # Salida
    output_dir: str = "./internet_measurements"
    csv_filename: str = "internet_quality.csv"

    # Logging
    enable_file_log: bool = True
    log_filename: str = "internet_quality.log"
    log_max_bytes: int = 2_000_000
    log_backup_count: int = 5

    # Destinos ping
    ping_targets: List[str] = None

    # DNS y HTTP
    dns_hostname: str = "www.google.com"
    http_url: str = "https://www.google.com/generate_204"
    http_timeout_seconds: int = 5

    # Ping
    ping_count: int = 10
    ping_timeout_seconds: int = 1
    ping_interval_seconds: float = 0.2


def default_config() -> Config:
    cfg = Config()
    cfg.ping_targets = [
        "192.168.0.1",  # OBLIGATORIO: Reemplazar por gateway real
        "1.1.1.1",
        "8.8.8.8",
    ]
    return cfg


# =========================
# Logging
# =========================

def setup_logging(cfg: Config) -> logging.Logger:
    os.makedirs(cfg.output_dir, exist_ok=True)
    logger = logging.getLogger("internet_quality")
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    fmt = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    if cfg.enable_file_log:
        log_path = os.path.join(cfg.output_dir, cfg.log_filename)
        fh = RotatingFileHandler(
            log_path,
            maxBytes=cfg.log_max_bytes,
            backupCount=cfg.log_backup_count,
            encoding="utf-8",
        )
        fh.setFormatter(fmt)
        logger.addHandler(fh)

    return logger


# =========================
# Helpers generales
# =========================

def now_local() -> dt.datetime:
    return dt.datetime.now()


def within_official_hours(cfg: Config, t: dt.datetime) -> bool:
    if t.weekday() > 5:  # Dom=6
        return False
    start = t.replace(hour=cfg.start_hour, minute=0, second=0, microsecond=0)
    end = t.replace(hour=cfg.end_hour, minute=0, second=0, microsecond=0)
    return start <= t <= end


def next_interval_sleep_seconds(cfg: Config) -> int:
    t = now_local()
    next_ts = t.timestamp() + cfg.interval_seconds
    aligned = (int(next_ts) // cfg.interval_seconds) * cfg.interval_seconds
    return max(1, aligned - int(t.timestamp()))


def ensure_output_path(cfg: Config) -> str:
    os.makedirs(cfg.output_dir, exist_ok=True)
    return os.path.join(cfg.output_dir, cfg.csv_filename)


def write_csv_header_if_needed(csv_path: str, fieldnames: List[str]) -> None:
    if not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=fieldnames).writeheader()
            f.flush()
            os.fsync(f.fileno())


def warn_if_gateway_not_customized(cfg: Config, logger: logging.Logger) -> None:
    common_examples = {"192.168.0.1", "192.168.1.1", "10.0.0.1"}
    if cfg.ping_targets and cfg.ping_targets[0].strip() in common_examples:
        logger.warning(
            "ATENCIÓN: El primer destino de ping parece un ejemplo (%s). "
            "Debe reemplazarlo por el gateway real (router/firewall) de su institución.",
            cfg.ping_targets[0].strip(),
        )
        logger.warning(
            "Windows: use `ipconfig` y busque 'Default Gateway'. "
            "Linux: `ip route | grep default`."
        )


def os_is_windows() -> bool:
    return platform.system().lower().startswith("win")


# =========================
# Mediciones DNS + HTTP
# =========================

def dns_resolve_time_ms(hostname: str) -> Tuple[Optional[int], Optional[str]]:
    started = time.time()
    try:
        socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        return int((time.time() - started) * 1000), None
    except Exception as e:
        elapsed_ms = int((time.time() - started) * 1000)
        return None, f"{type(e).__name__}: {e} (elapsed {elapsed_ms}ms)"


def http_get_time_ms(url: str, timeout_seconds: int) -> Tuple[Optional[int], Optional[int], Optional[str]]:
    started = time.time()
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            status = getattr(resp, "status", None)
        return int((time.time() - started) * 1000), status, None
    except Exception as e:
        elapsed_ms = int((time.time() - started) * 1000)
        return None, None, f"{type(e).__name__}: {e} (elapsed {elapsed_ms}ms)"


# =========================
# Ping: ejecución + parseo por SO
# =========================

def build_ping_cmd(cfg: Config, target: str) -> List[str]:
    if os_is_windows():
        return ["ping", "-n", str(cfg.ping_count), "-w", str(int(cfg.ping_timeout_seconds * 1000)), target]
    return ["ping", "-c", str(cfg.ping_count), "-W", str(cfg.ping_timeout_seconds), "-i", str(cfg.ping_interval_seconds), target]


def parse_ping_linux(stdout: str) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float], Optional[float]]:
    loss_pct = None
    rtt_min = rtt_avg = rtt_max = jitter = None

    for line in stdout.splitlines():
        if "packet loss" in line:
            m = re.search(r"(\d+(?:\.\d+)?)%\s*packet loss", line)
            if m:
                loss_pct = float(m.group(1))
        if "min/avg/max" in line and "=" in line:
            m = re.search(r"=\s*([\d\.]+)/([\d\.]+)/([\d\.]+)/([\d\.]+)\s*ms", line)
            if m:
                rtt_min = float(m.group(1))
                rtt_avg = float(m.group(2))
                rtt_max = float(m.group(3))
                jitter = float(m.group(4))
    return loss_pct, rtt_min, rtt_avg, rtt_max, jitter


def parse_ping_windows(stdout: str, ping_count: int) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float], Optional[float]]:
    times: List[float] = []

    for line in stdout.splitlines():
        line_l = line.lower()

        m_eq = re.search(r"(?:time|tiempo)\s*=\s*(\d+)\s*ms", line_l)
        if m_eq:
            times.append(float(m_eq.group(1)))
            continue

        m_lt = re.search(r"(?:time|tiempo)\s*<\s*(\d+)\s*ms", line_l)
        if m_lt:
            times.append(float(m_lt.group(1)))
            continue

    loss_pct = None
    m_loss_en = re.search(r"\(\s*(\d+)%\s*loss\s*\)", stdout, re.IGNORECASE)
    if m_loss_en:
        loss_pct = float(m_loss_en.group(1))
    if loss_pct is None:
        m_loss_es = re.search(r"\(\s*(\d+)%\s*(?:perdidos|p[eé]rdidas)\s*\)", stdout, re.IGNORECASE)
        if m_loss_es:
            loss_pct = float(m_loss_es.group(1))

    if loss_pct is None:
        received = len(times)
        loss_pct = max(0.0, (1.0 - (received / max(1, ping_count))) * 100.0)

    if not times:
        return loss_pct, None, None, None, None

    rtt_min = min(times)
    rtt_max = max(times)
    rtt_avg = sum(times) / len(times)
    jitter = statistics.pstdev(times) if len(times) >= 2 else 0.0
    return loss_pct, rtt_min, rtt_avg, rtt_max, jitter


def run_ping(cfg: Config, target: str) -> Dict[str, Any]:
    cmd = build_ping_cmd(cfg, target)
    started = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    elapsed_ms = int((time.time() - started) * 1000)

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    rc = proc.returncode

    if os_is_windows():
        loss_pct, rtt_min, rtt_avg, rtt_max, jitter = parse_ping_windows(stdout, cfg.ping_count)
    else:
        loss_pct, rtt_min, rtt_avg, rtt_max, jitter = parse_ping_linux(stdout)

    return {
        "ping_target": target,
        "ping_rc": rc,
        "ping_elapsed_ms": elapsed_ms,
        "ping_loss_pct": loss_pct,
        "ping_rtt_min_ms": rtt_min,
        "ping_rtt_avg_ms": rtt_avg,
        "ping_rtt_max_ms": rtt_max,
        "ping_jitter_ms": jitter,
        "ping_stderr": (stderr.strip()[:300] if stderr else ""),
    }


# =========================
# Escritura durable del CSV
# =========================

def append_csv_row_durable(csv_path: str, fieldnames: List[str], row: Dict[str, Any]) -> None:
    """
    Escribe una fila y fuerza persistencia: flush + fsync.
    Útil para que el archivo sirva como evidencia ante reclamos.
    """
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writerow(row)
        f.flush()
        os.fsync(f.fileno())


# =========================
# Main
# =========================

def main() -> int:
    cfg = default_config()
    logger = setup_logging(cfg)

    csv_path = ensure_output_path(cfg)

    logger.info("Iniciando Monitor de Calidad de Internet (SO: %s)", platform.system())
    logger.info("Horario oficial: Lunes–Sábado, %02d:00–%02d:00", cfg.start_hour, cfg.end_hour)
    logger.info("Intervalo: %ss (en horario oficial)", cfg.interval_seconds)
    logger.info("Destinos ping: %s", ", ".join(cfg.ping_targets or []))
    logger.info("DNS: %s | HTTP: %s", cfg.dns_hostname, cfg.http_url)
    logger.info("CSV (evidencia): %s", os.path.abspath(csv_path))

    warn_if_gateway_not_customized(cfg, logger)

    fieldnames = [
        "timestamp_local",
        "weekday",
        "official_hours",
        "os",
        "dns_hostname",
        "dns_time_ms",
        "dns_error",
        "http_url",
        "http_time_ms",
        "http_status",
        "http_error",
        "ping_target",
        "ping_rc",
        "ping_elapsed_ms",
        "ping_loss_pct",
        "ping_rtt_min_ms",
        "ping_rtt_avg_ms",
        "ping_rtt_max_ms",
        "ping_jitter_ms",
        "ping_stderr",
        "notes",
    ]
    write_csv_header_if_needed(csv_path, fieldnames)

    while True:
        t = now_local()
        if not within_official_hours(cfg, t):
            sleep_s = next_interval_sleep_seconds(cfg)
            logger.info(
                "Fuera de horario oficial (%s). No se mide. Próxima verificación en %ss.",
                t.strftime("%Y-%m-%d %H:%M:%S"),
                sleep_s,
            )
            time.sleep(sleep_s)
            continue

        ts_str = t.strftime("%Y-%m-%d %H:%M:%S")
        weekday = t.strftime("%A")
        logger.info("En horario oficial (%s). Iniciando mediciones…", ts_str)

        dns_ms, dns_err = dns_resolve_time_ms(cfg.dns_hostname)
        if dns_err:
            logger.warning("DNS: error resolviendo %s | %s", cfg.dns_hostname, dns_err)
        else:
            logger.info("DNS: %s en %sms", cfg.dns_hostname, dns_ms)

        http_ms, http_status, http_err = http_get_time_ms(cfg.http_url, cfg.http_timeout_seconds)
        if http_err:
            logger.warning("HTTP: error consultando %s | %s", cfg.http_url, http_err)
        else:
            logger.info("HTTP: status=%s en %sms", http_status, http_ms)

        for target in cfg.ping_targets or []:
            logger.info("Ping: midiendo contra %s (%d solicitudes)…", target, cfg.ping_count)
            ping = run_ping(cfg, target)

            loss = ping.get("ping_loss_pct")
            rtt_avg = ping.get("ping_rtt_avg_ms")
            jitter = ping.get("ping_jitter_ms")

            logger.info(
                "Ping %s: pérdida=%s%% rtt_avg=%s ms jitter=%s ms",
                target,
                f"{loss:.1f}" if isinstance(loss, (int, float)) else "N/A",
                f"{rtt_avg:.1f}" if isinstance(rtt_avg, (int, float)) else "N/A",
                f"{jitter:.1f}" if isinstance(jitter, (int, float)) else "N/A",
            )

            row = {
                "timestamp_local": ts_str,
                "weekday": weekday,
                "official_hours": "yes",
                "os": platform.system(),
                "dns_hostname": cfg.dns_hostname,
                "dns_time_ms": dns_ms,
                "dns_error": dns_err,
                "http_url": cfg.http_url,
                "http_time_ms": http_ms,
                "http_status": http_status,
                "http_error": http_err,
                "notes": "",
                **ping,
            }

            # ESCRITURA INMEDIATA Y DURABLE
            append_csv_row_durable(csv_path, fieldnames, row)

        sleep_s = next_interval_sleep_seconds(cfg)
        logger.info("Medición finalizada. Próxima medición/chequeo en %ss.", sleep_s)
        time.sleep(sleep_s)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nFinalizado por el usuario (Ctrl+C).")
        raise SystemExit(0)
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)

