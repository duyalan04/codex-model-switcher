use rusqlite::{Connection, Result};
use std::env;

fn main() -> Result<()> {
    let db_path = if cfg!(target_os = "windows") {
        std::path::PathBuf::from(env::var("APPDATA").unwrap_or_default())
            .join("9router")
            .join("db")
            .join("data.sqlite")
    } else {
        std::path::PathBuf::from(env::var("HOME").unwrap_or_default())
            .join(".config/9router/data.sqlite")
    };

    println!("DB: {:?}", db_path);
    if !db_path.exists() {
        println!("NOT FOUND");
        return Ok(());
    }

    let conn = Connection::open(&db_path)?;

    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")?;
    let tables: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    println!("\n=== {} TABLES ===", tables.len());
    for t in &tables { println!("  {}", t); }

    let targets: Vec<&String> = tables
        .iter()
        .filter(|t| {
            let l = t.to_lowercase();
            l.contains("provider") || l.contains("usage") || l.contains("quota") || l.contains("credit") || l.contains("limit")
        })
        .collect();

    for t in targets {
        if let Ok(sql) = conn.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
            [t],
            |row| row.get::<_, String>(0),
        ) {
            println!("\n=== {t} ===");
            println!("{}", sql);
        }
    }

    if tables.iter().any(|t| t == "providerConnections") {
        println!("\n=== providerConnections columns ===");
        let mut cols = conn.prepare("PRAGMA table_info(providerConnections)")?;
        let col_info = cols.query_map([], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?;
        for r in col_info.flatten() {
            println!("  {}: {} {}", r.0, r.1, r.2);
        }

        println!("\n=== providerConnections (first 2) ===");
        let mut rows = conn.prepare("SELECT id, name, provider, authType FROM providerConnections LIMIT 2")?;
        let row_data = rows.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))
        })?;
        for r in row_data.flatten() {
            println!("  id={} name={} provider={} authType={}", r.0, r.1, r.2, r.3);
        }
    }

    Ok(())
}
