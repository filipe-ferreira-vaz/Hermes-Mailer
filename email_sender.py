import smtplib
from email.mime.text import MIMEText

def send_email(to_email, subject, body, smtp_config):
    """
    Sends an email to the recipient using the SMTP configuration provided.
    """
    host = smtp_config.get('smtp_host', '').strip()
    port_str = smtp_config.get('smtp_port') or '587'
    user = smtp_config.get('smtp_user', '').strip()
    password = smtp_config.get('smtp_pass', '').strip()
    use_tls = smtp_config.get('smtp_use_tls') == '1'
    
    if not host or not user or not password:
        return False, "SMTP host, user, and password are required. Please configure them in Settings."
        
    try:
        port = int(port_str)
    except ValueError:
        return False, f"Invalid SMTP Port: {port_str}. Must be a number."
        
    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = user
        msg['To'] = to_email
        
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            if use_tls:
                server.ehlo()
                server.starttls()
                server.ehlo()
                
        if password:
            server.login(user, password)
            
        server.sendmail(user, [to_email], msg.as_string())
        server.quit()
        return True, "Email sent successfully"
    except Exception as e:
        return False, f"SMTP error: {str(e)}"

def test_smtp_connection(smtp_config):
    """
    Attempts to establish a connection to the SMTP server and log in.
    Returns (success, message).
    """
    host = smtp_config.get('smtp_host', '').strip()
    port_str = smtp_config.get('smtp_port') or '587'
    user = smtp_config.get('smtp_user', '').strip()
    password = smtp_config.get('smtp_pass', '').strip()
    use_tls = smtp_config.get('smtp_use_tls') == '1'
    
    if not host:
        return False, "SMTP host is required."
        
    try:
        port = int(port_str)
    except ValueError:
        return False, f"Invalid SMTP Port: {port_str}."
        
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=8)
        else:
            server = smtplib.SMTP(host, port, timeout=8)
            if use_tls:
                server.ehlo()
                server.starttls()
                server.ehlo()
                
        if user and password:
            server.login(user, password)
            
        server.quit()
        return True, "Connection established and authenticated successfully!"
    except Exception as e:
        return False, f"SMTP Connection failed: {str(e)}"
