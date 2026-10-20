use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
use windows::Win32::Storage::FileSystem::{
    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
};

pub(crate) fn read_config(path: &Path) -> Result<(Vec<u8>, Value), String> {
    let mut bytes = Vec::new();
    match fs::File::open(path) {
        Ok(file) => {
            file.take(1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Não foi possível ler os hooks")?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Não foi possível ler a configuração de hooks".into()),
    }
    if bytes.len() > 1024 * 1024 {
        return Err("Configuração de hooks excede o limite".into());
    }
    let value = if bytes.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&bytes)
            .map_err(|_| "Configuração de hooks inválida; arquivo preservado")?
    };
    if !value.is_object() {
        return Err("Configuração de hooks deve ser um objeto".into());
    }
    Ok((bytes, value))
}

pub(crate) fn write_config(path: &Path, original: &[u8], value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| "Hooks inválidos")?;
    if bytes.len() > 1024 * 1024 {
        return Err("Configuração de hooks excede o limite; arquivo preservado".into());
    }
    let parent = path.parent().ok_or("Diretório de hooks inválido")?;
    fs::create_dir_all(parent).map_err(|_| "Não foi possível criar o diretório de hooks")?;
    let temporary = parent.join(format!(".strata-hooks-{:016x}.tmp", rand::random::<u64>()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "Não foi possível preparar os hooks")?;
        file.write_all(&bytes)
            .map_err(|_| "Não foi possível escrever os hooks")?;
        file.sync_all()
            .map_err(|_| "Não foi possível salvar os hooks")?;
        drop(file);
        if read_config(path)?.0 != original {
            return Err("Os hooks mudaram durante a configuração; tente novamente".into());
        }
        unsafe {
            MoveFileExW(
                &windows::core::HSTRING::from(temporary.as_os_str()),
                &windows::core::HSTRING::from(path.as_os_str()),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
        .map_err(|_| "Não foi possível substituir os hooks")?;
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    result
}
