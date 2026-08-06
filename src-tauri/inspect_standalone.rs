// Standalone DB inspector
// Build: rustc --edition 2021 -L "C:\Users\Zuy\.cargo\registry\src" inspect_standalone.rs -o inspect_standalone.exe
// Or simpler: put this in the tauri project and run cargo test

fn main() {
    use rusqlite::{Connection, Result};
    use std::env;

    let db_path = if cfg!(target_os = "windows") {
        std::path::PathBuf::from(env::var("APPDATA").unwrap_or_default())
            .join("9router").join("db").join("data.sqlite")
    } else {
        std::path::PathBuf::from(env::var("HOME").unwrap_or_default())
            .join(".config/9router/data.sqlite")
    };

    println!("DB: {:?}", db_path);
    if !db_path.exists() { println!("NOT FOUND"); return; }

    let conn = Connection::open(&db_path).unwrap();

    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").unwrap();
    let tables: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap()
        .filter_map(|r| r.ok()).collect();
    println!("\n=== {} TABLES ===", tables.len());
    for t in &tables { println!("  {}", t); }

    let targets: Vec<&String> = tables.iter()
        .filter(|t| t.to_lowercase().contains("provider") || t.to_lowercase().contains("usage") || t.to_lowercase().contains("quota") || t.to_lowercase().contains("credit") || t.to_lowercase().contains("limit"))
        .collect();
    for t in targets {
        if let Ok(sql) = conn.query_row("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [t], |r| r.get::<_,String>(0)) {
            println!("\n=== {t} ===");
            println!("{}", sql);
        }
    }

    if tables.iter().any(|t| t == "providerConnections") {
        println!("\n=== providerConnections columns ===");
        let mut c = conn.prepare("PRAGMA table_info(providerConnections)").unwrap();
        let cols: Vec<(i32, String, String)> = c.query_map([], |r| Ok((r.get(0).unwrap(), r.get(1).unwrap(), r.get(2).unwrap()))).unwrap()
            .filter_map(|r| r.ok()).collect();
        for (i, n, t) in cols { println!("  {}: {} ({})", i, n, t); }

        println!("\n=== providerConnections sample ===");
        let mut r = conn.prepare("SELECT id, name, provider, authType FROM providerConnections LIMIT 2").unwrap();
        let rows: Vec<(String, String, String, String)> = r.query_map([], |r| Ok((r.get(0).unwrap(), r.get(1).unwrap(), r.get(2).unwrap(), r.get(3).unwrap()))).unwrap()
            .filter_map(|r| r.ok()).collect();
        for (id, name, prov, auth) in rows { println!("  id={} name={} provider={} authType={}", id, name, prov, auth); }
    }
}
