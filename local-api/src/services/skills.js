// Skill taxonomy used for deterministic job/resume analysis. canonical -> aliases.
const RAW = {
  "JavaScript": ["javascript", "js", "ecmascript"], "TypeScript": ["typescript"], "Python": ["python"], "Java": ["java"],
  "C++": ["c++", "cpp"], "C#": ["c#", "csharp"], "Go": ["golang"], "Rust": ["rust"], "Ruby": ["ruby"], "PHP": ["php"],
  "Swift": ["swift"], "Kotlin": ["kotlin"], "Scala": ["scala"], "SQL": ["sql"], "Bash": ["bash", "shell scripting"],
  "Perl": ["perl"], "MATLAB": ["matlab"], "Verilog": ["verilog", "systemverilog"], "VHDL": ["vhdl"], "Tcl": ["tcl"],
  "React": ["react", "react.js", "reactjs"], "Angular": ["angular", "angularjs"], "Vue": ["vue", "vue.js", "vuejs"],
  "Next.js": ["next.js", "nextjs"], "Node.js": ["node.js", "nodejs", "node"], "Express": ["express.js", "expressjs"],
  "Django": ["django"], "Flask": ["flask"], "FastAPI": ["fastapi"], "Spring": ["spring", "spring boot"], ".NET": [".net", "dotnet", "asp.net"],
  "Rails": ["ruby on rails", "rails"], "HTML": ["html", "html5"], "CSS": ["css", "css3", "sass", "scss"], "Tailwind": ["tailwind", "tailwindcss"],
  "GraphQL": ["graphql"], "REST": ["rest", "restful", "rest api", "rest apis"], "gRPC": ["grpc"],
  "PostgreSQL": ["postgresql", "postgres"], "MySQL": ["mysql"], "MongoDB": ["mongodb", "mongo"], "Redis": ["redis"],
  "SQLite": ["sqlite"], "Elasticsearch": ["elasticsearch", "opensearch"], "Cassandra": ["cassandra"], "DynamoDB": ["dynamodb"],
  "Kafka": ["kafka"], "RabbitMQ": ["rabbitmq"], "Spark": ["spark", "pyspark"], "Hadoop": ["hadoop"], "Airflow": ["airflow"],
  "AWS": ["aws", "amazon web services"], "Azure": ["azure"], "GCP": ["gcp", "google cloud"], "Docker": ["docker"],
  "Kubernetes": ["kubernetes", "k8s"], "Terraform": ["terraform"], "Ansible": ["ansible"], "Jenkins": ["jenkins"],
  "CI/CD": ["ci/cd", "cicd", "continuous integration", "continuous delivery"], "Git": ["git", "github", "gitlab"],
  "Linux": ["linux", "unix"], "Networking": ["tcp/ip", "networking", "tcp", "dns"],
  "Distributed Systems": ["distributed systems", "distributed computing"], "Microservices": ["microservices", "microservice"],
  "System Design": ["system design", "systems design"], "Data Structures": ["data structures", "algorithms"],
  "Machine Learning": ["machine learning", "ml"], "Deep Learning": ["deep learning"], "NLP": ["nlp", "natural language processing"],
  "Computer Vision": ["computer vision"], "PyTorch": ["pytorch"], "TensorFlow": ["tensorflow"], "scikit-learn": ["scikit-learn", "sklearn"],
  "LLM": ["llm", "llms", "large language models", "generative ai"], "Pandas": ["pandas"], "NumPy": ["numpy"],
  "Data Analysis": ["data analysis", "data analytics"], "Tableau": ["tableau"], "Power BI": ["power bi", "powerbi"], "Excel": ["excel"],
  "Android": ["android"], "iOS": ["ios"], "React Native": ["react native"], "Flutter": ["flutter"],
  "Testing": ["unit testing", "test automation", "pytest", "jest", "selenium", "qa"], "Agile": ["agile", "scrum", "kanban"],
  "Jira": ["jira"], "Security": ["security", "cybersecurity", "owasp"], "Embedded": ["embedded", "firmware", "rtos"],
  "EDA": ["eda", "electronic design automation"], "VLSI": ["vlsi"], "Multithreading": ["multithreading", "concurrency", "multi-threading"],
  "Performance Optimization": ["performance optimization", "performance tuning", "profiling"],
  "Product Management": ["product management", "roadmap"], "UX": ["ux", "user experience", "figma"], "Communication": ["communication skills"],
  "Leadership": ["leadership", "mentoring", "team lead"], "Project Management": ["project management", "pmp"],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const entries = Object.entries(RAW).map(([canonical, aliases]) => ({
  canonical,
  re: new RegExp(`(?<![A-Za-z0-9+#.])(?:${[canonical, ...aliases].map((a) => esc(a.toLowerCase())).join("|")})(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`, "i"),
}));

export function detectSkills(text) {
  const t = String(text || "");
  return entries.filter((e) => e.re.test(t)).map((e) => e.canonical);
}

export function canonicalizeSkill(s) {
  const t = String(s || "").trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(RAW)) {
    if (canonical.toLowerCase() === t || aliases.includes(t)) return canonical;
  }
  return String(s || "").trim();
}
