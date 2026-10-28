//! Unelevated IP Helper / Native Wi-Fi adapter. No shell commands or COM.
use crate::network_contract::NetworkInterface;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use windows::Win32::{
    Foundation::{GetLastError, HANDLE},
    NetworkManagement::{IpHelper::*, Ndis::IfOperStatusUp, WiFi::*},
    Networking::WinSock::*,
};

pub struct Observation {
    pub interface: NetworkInterface,
    pub received: u64,
    pub sent: u64,
}
fn wide(s: &[u16]) -> String {
    String::from_utf16_lossy(&s[..s.iter().position(|c| *c == 0).unwrap_or(s.len())])
}
pub fn socket(ip: IpAddr) -> SOCKADDR_INET {
    let mut address = SOCKADDR_INET::default();
    match ip {
        IpAddr::V4(ip) => {
            address.Ipv4.sin_family = AF_INET;
            address.Ipv4.sin_addr.S_un.S_addr = u32::from_ne_bytes(ip.octets());
        }
        IpAddr::V6(ip) => {
            address.Ipv6.sin6_family = AF_INET6;
            address.Ipv6.sin6_addr.u.Byte = ip.octets();
        }
    }
    address
}
unsafe fn address(p: *const SOCKADDR) -> Option<String> {
    if p.is_null() {
        return None;
    }
    match (*p).sa_family {
        AF_INET => Some(
            Ipv4Addr::from(
                (*(p as *const SOCKADDR_IN))
                    .sin_addr
                    .S_un
                    .S_addr
                    .to_ne_bytes(),
            )
            .to_string(),
        ),
        AF_INET6 => {
            Some(Ipv6Addr::from((*(p as *const SOCKADDR_IN6)).sin6_addr.u.Byte).to_string())
        }
        _ => None,
    }
}
pub fn route(target: IpAddr, index: u32) -> Result<(u32, SOCKADDR_INET), String> {
    unsafe {
        let mut row = MIB_IPFORWARD_ROW2::default();
        let mut source = SOCKADDR_INET::default();
        GetBestRoute2(None, index, None, &socket(target), 0, &mut row, &mut source)
            .ok()
            .map_err(|e| format!("Sem rota compatível: {e}"))?;
        if index != 0 && row.InterfaceIndex != index {
            return Err("Rota fora da interface selecionada".into());
        }
        Ok((row.InterfaceIndex, source))
    }
}
pub fn default_index() -> Option<u32> {
    route("1.1.1.1".parse().unwrap(), 0)
        .or_else(|_| route("2606:4700:4700::1111".parse().unwrap(), 0))
        .ok()
        .map(|r| r.0)
}
pub fn collect() -> Result<Vec<Observation>, String> {
    unsafe {
        let mut table = std::ptr::null_mut();
        GetIfTable2(&mut table).ok().map_err(|e| e.to_string())?;
        // Copy all values before releasing the Windows-owned table.
        let rows =
            std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
        let mut result = Vec::new();
        for row in rows {
            if row.Type == 24 {
                continue;
            } // Software loopback is not a network connection.
            let mut interface = NetworkInterface {
                id: format!("{:?}", row.InterfaceGuid),
                index: row.InterfaceIndex,
                name: wide(&row.Alias),
                kind: match row.Type {
                    6 => "Ethernet",
                    71 => "Wi-Fi",
                    131 => "Tunnel",
                    _ => "Virtual / outro",
                }
                .into(),
                connected: row.OperStatus == IfOperStatusUp,
                addresses: vec![],
                gateways: vec![],
                receive_link_bps: (row.ReceiveLinkSpeed > 0).then_some(row.ReceiveLinkSpeed as f64),
                transmit_link_bps: (row.TransmitLinkSpeed > 0)
                    .then_some(row.TransmitLinkSpeed as f64),
                ssid: None,
                signal_percent: None,
                wifi_error: None,
            };
            if row.Type == 71 {
                wifi(&row.InterfaceGuid, &mut interface);
            }
            result.push(Observation {
                interface,
                received: row.InOctets,
                sent: row.OutOctets,
            });
        }
        FreeMibTable(table.cast());
        // Vec<u64> provides the alignment required by the linked adapter structures.
        let mut size = 16_384u32;
        for _ in 0..3 {
            let mut buffer = vec![0u64; (size as usize + 7) / 8];
            let head = buffer.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
            let status = GetAdaptersAddresses(
                AF_UNSPEC.0 as u32,
                GAA_FLAG_INCLUDE_GATEWAYS,
                None,
                Some(head),
                &mut size,
            );
            if status == 111 {
                if size > 4_194_304 {
                    break;
                }
                continue;
            }
            if status != 0 {
                break;
            }
            let mut adapter = head;
            while !adapter.is_null() {
                let a = &*adapter;
                if let Some(row) = result.iter_mut().find(|r| {
                    r.interface.index == a.Anonymous1.Anonymous.IfIndex
                        || r.interface.index == a.Ipv6IfIndex
                }) {
                    let mut unicast = a.FirstUnicastAddress;
                    while !unicast.is_null() {
                        if let Some(ip) = address((*unicast).Address.lpSockaddr) {
                            row.interface.addresses.push(ip);
                        }
                        unicast = (*unicast).Next;
                    }
                    let mut gateway = a.FirstGatewayAddress;
                    while !gateway.is_null() {
                        if let Some(ip) = address((*gateway).Address.lpSockaddr) {
                            row.interface.gateways.push(ip);
                        }
                        gateway = (*gateway).Next;
                    }
                }
                adapter = a.Next;
            }
            break;
        }
        Ok(result)
    }
}
unsafe fn wifi(guid: &windows_core::GUID, interface: &mut NetworkInterface) {
    let mut handle = HANDLE::default();
    let mut version = 0;
    let status = WlanOpenHandle(2, None, &mut version, &mut handle);
    if status != 0 {
        interface.wifi_error = Some(format!("Wi-Fi indisponível ({status})"));
        return;
    }
    let mut size = 0;
    let mut data = std::ptr::null_mut();
    let status = WlanQueryInterface(
        handle,
        guid,
        wlan_intf_opcode_current_connection,
        None,
        &mut size,
        &mut data,
        None,
    );
    if status == 0
        && !data.is_null()
        && size as usize >= std::mem::size_of::<WLAN_CONNECTION_ATTRIBUTES>()
    {
        let connection = &*data.cast::<WLAN_CONNECTION_ATTRIBUTES>();
        let ssid = &connection.wlanAssociationAttributes.dot11Ssid;
        interface.ssid = Some(
            String::from_utf8_lossy(&ssid.ucSSID[..(ssid.uSSIDLength as usize).min(32)])
                .into_owned(),
        );
        interface.signal_percent = Some(
            connection
                .wlanAssociationAttributes
                .wlanSignalQuality
                .min(100),
        );
    } else {
        interface.wifi_error = Some(format!(
            "SSID/sinal indisponível; verifique a permissão de localização do Windows ({status})"
        ));
    }
    if !data.is_null() {
        WlanFreeMemory(data);
    }
    WlanCloseHandle(handle, None);
}
/// None denotes a sent probe with no successful response; Err is a local failure.
pub fn probe(target: IpAddr, index: u32) -> Result<Option<f64>, String> {
    let (_, source) = route(target, index)?;
    unsafe {
        let handle = if target.is_ipv4() {
            IcmpCreateFile()
        } else {
            Icmp6CreateFile()
        }
        .map_err(|e| e.to_string())?;
        let payload = [0u8; 32];
        let mut reply = [0u64; 128];
        let count = match target {
            IpAddr::V4(ip) => IcmpSendEcho2Ex(
                handle,
                None,
                None,
                None,
                source.Ipv4.sin_addr.S_un.S_addr,
                u32::from_ne_bytes(ip.octets()),
                payload.as_ptr().cast(),
                32,
                None,
                reply.as_mut_ptr().cast(),
                1024,
                1000,
            ),
            IpAddr::V6(_) => Icmp6SendEcho2(
                handle,
                None,
                None,
                None,
                &source.Ipv6,
                &socket(target).Ipv6,
                payload.as_ptr().cast(),
                32,
                None,
                reply.as_mut_ptr().cast(),
                1024,
                1000,
            ),
        };
        let error = GetLastError().0;
        let _ = IcmpCloseHandle(handle);
        if count == 0 {
            return if matches!(error, 11002..=11005 | 11010 | 11013 | 11014) {
                Ok(None)
            } else {
                Err(format!("ICMP indisponível ({error})"))
            };
        }
        let (status, rtt) = if target.is_ipv4() {
            let r = &*reply.as_ptr().cast::<ICMP_ECHO_REPLY>();
            (r.Status, r.RoundTripTime)
        } else {
            let r = &*reply.as_ptr().cast::<ICMPV6_ECHO_REPLY_LH>();
            (r.Status, r.RoundTripTime)
        };
        if status == 0 {
            Ok(Some(rtt as f64))
        } else if matches!(status, 11002..=11005 | 11010 | 11013 | 11014) {
            Ok(None)
        } else {
            Err(format!("ICMP sem resposta válida ({status})"))
        }
    }
}

/// Standalone acceptance probe: does not create windows or alter configuration.
pub fn probe_snapshot() -> serde_json::Value {
    let first = collect();
    let default = default_index();
    let start = std::time::Instant::now();
    std::thread::sleep(std::time::Duration::from_secs(2));
    match (first, collect()) {
        (Ok(first), Ok(second)) => {
            let selected = second.iter().find(|r| Some(r.interface.index) == default);
            let rates = selected.and_then(|r| first.iter().find(|p| p.interface.id==r.interface.id).map(|p| serde_json::json!({"download":r.received.checked_sub(p.received).map(|d|d as f64/start.elapsed().as_secs_f64()),"upload":r.sent.checked_sub(p.sent).map(|d|d as f64/start.elapsed().as_secs_f64())})));
            let icmp = default.map(|index| probe("1.1.1.1".parse().unwrap(), index));
            serde_json::json!({"timestamp":crate::metrics::timestamp() as f64,"defaultIndex":default,"interfaces":second.iter().map(|r|&r.interface).collect::<Vec<_>>(),"rates":rates,"icmp":icmp})
        }
        (first, second) => {
            serde_json::json!({"error":format!("{:?} / {:?}",first.err(),second.err())})
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Reads local Windows interfaces and sends one source-constrained ICMP probe; no windows or configuration changes"]
    fn live_windows_network_acceptance() {
        let snapshot = probe_snapshot();
        let path = std::env::temp_dir().join(format!(
            "strata-network-interfaces-{}.json",
            crate::metrics::timestamp()
        ));
        std::fs::write(&path, serde_json::to_string_pretty(&snapshot).unwrap()).unwrap();
        println!("Evidence: {}", path.display());
        assert!(snapshot.get("error").is_none(), "{snapshot}");
        assert!(!snapshot["interfaces"].as_array().unwrap().is_empty());
        assert!(snapshot["defaultIndex"].is_number());
        assert!(snapshot["rates"]["download"]
            .as_f64()
            .is_some_and(|n| n >= 0.));
        assert!(snapshot["rates"]["upload"]
            .as_f64()
            .is_some_and(|n| n >= 0.));
    }
}
