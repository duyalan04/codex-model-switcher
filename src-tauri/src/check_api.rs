// Search MITM server.js for quota/subscription/billing logic - write to file
fn main() {
    let out = std::path::PathBuf::from(std::env::var("USERPROFILE").unwrap()).join("check_api_out.txt");
    let mut file = std::fs::File::create(&out).unwrap();
    let mut w = |s: &str| { use std::io::Write; let _ = file.write_all(s.as_bytes()); let _ = file.write_all(b"\n"); };

    let base_dir = std::path::PathBuf::from(std::env::var("APPDATA").unwrap()).join("9router");
    let mitm_path = base_dir.join("runtime").join("mitm").join("server.js");

    let content = std::fs::read_to_string(&mitm_path).unwrap();

    let search_terms = [
        "quota", "credit", "billing", "subscription", "usage",
        "limit", "remaining", "grant", "cost", "price",
        "anthropic", "openai", "fetchCredits", "getCredits",
        "checkQuota", "getUsage", "chatgpt.com/api",
        "chatgptAccountId", "chatgptPlanType", "plan_type",
        "planType", "plus", "pro",
    ];

    for term in &search_terms {
        let lower = content.to_lowercase();
        let term_lower = term.to_lowercase();
        let mut positions: Vec<usize> = Vec::new();
        let mut pos = 0;
        while let Some(idx) = lower[pos..].find(&term_lower) {
            positions.push(pos + idx);
            pos += idx + term.len();
        }
        if !positions.is_empty() {
            w(&format!("\n=== '{}' found {} times ===", term, positions.len()));
            for pos in positions.iter().take(5) {
                let start = pos.saturating_sub(150);
                let end = (*pos + term.len() + 200).min(content.len());
                let snippet = &content[start..end];
                w(&format!("  ...{}...\n", snippet.replace('\n', " | ")));
            }
        }
    }

    drop(file);
    println!("Done. Output: {:?}", out);
}
