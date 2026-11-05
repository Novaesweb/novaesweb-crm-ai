"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {ArrowRight,LockKeyhole,Eye,EyeOff,ShieldCheck,CheckCircle2,CircleAlert} from "lucide-react";
import styles from "@/components/crm-login.module.css";

export default function ResetPasswordPage(){
  const [token,setToken]=useState("");
  const [checking,setChecking]=useState(true);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    // Supabase password-recovery links carry an access token in the URL fragment.
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
    const type=hash.get("type");
    const access=hash.get("access_token");
    if(type==="recovery" && access && access.length>=30 && access.length<=4096)setToken(access);
    // Drop the bearer token from the visible URL and browser history immediately.
    window.history.replaceState(null,"",window.location.pathname);
    setChecking(false);
  },[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");
    if(password!==confirm){setError("As senhas não coincidem.");return;}
    if(password.length<8||password.length>256){setError("Use uma senha de 8 a 256 caracteres.");return;}
    setLoading(true);
    try{
      const response=await fetch("/api/crm/auth/reset",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,password})
      });
      if(!response.ok){setError(response.status===401?"Link inválido ou expirado. Solicite uma nova recuperação.":"Não foi possível atualizar a senha.");return;}
      setToken("");setPassword("");setConfirm("");setDone(true);
    }catch{setError("Falha de conexão. Tente novamente.");}
    finally{setLoading(false);}
  }
  return <main className={styles.scene}><div className={styles.ambientTop} aria-hidden="true"/><div className={styles.ambientBottom} aria-hidden="true"/>
    <div className={styles.frame}>
      <header className={styles.brand}><span className={styles.brandMark}>N</span><span className={styles.brandName}>NovaesWeb</span><span className={styles.brandBadge}>CRM AI</span></header>
      <section className={styles.card} aria-labelledby="reset-title">
        <div className={styles.lockIcon}><LockKeyhole size={35}/></div>
        <h1 id="reset-title">Nova senha</h1>
        <p className={styles.description}>{done?"Sua senha foi alterada. Agora você pode entrar no CRM.":"Crie uma nova senha para sua conta autorizada."}</p>
        {checking?<p className={styles.description}>Verificando link...</p>
        :done?<Link className={styles.submit} href="/">Ir para o login <ArrowRight size={23}/></Link>
        :!token?<p className={styles.alert} role="alert"><CircleAlert size={18}/>Link de recuperação ausente ou inválido. Solicite outro na tela de login.</p>
        :<form className={styles.form} onSubmit={submit}>
          <div className={styles.field}><label htmlFor="new-password">Nova senha</label>
            <div className={styles.inputShell}><LockKeyhole size={21}/><input id="new-password" type={show?"text":"password"} required minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nova senha"/>
              <button type="button" className={styles.eyeButton} aria-label={show?"Ocultar senha":"Mostrar senha"} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={22}/>:<Eye size={22}/>}</button></div>
          </div>
          <div className={styles.field}><label htmlFor="confirm-password">Confirmar senha</label>
            <div className={styles.inputShell}><LockKeyhole size={21}/><input id="confirm-password" type={show?"text":"password"} required minLength={8} maxLength={256} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repita a senha"/></div>
          </div>
          {error&&<p className={styles.alert} role="alert"><CircleAlert size={18}/>{error}</p>}
          <button type="submit" className={styles.submit} disabled={loading||!password||!confirm}>{loading?"Salvando...":"Salvar nova senha"}<ArrowRight size={23}/></button>
        </form>}
        {!done&&<p className={styles.securityNote}><ShieldCheck size={23}/>A recuperação só funciona com um link válido enviado ao e-mail cadastrado.</p>}
        {!done&&<Link className={styles.back} href="/">Voltar para o login</Link>}
      </section>
    </div>
  </main>;
}
