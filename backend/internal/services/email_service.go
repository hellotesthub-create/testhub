package services

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"net"
	"net/smtp"
	"net/textproto"
	"os"
	"strconv"
	"strings"
	"time"
)

type EmailAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

type EmailService struct {
	host                 string
	port                 int
	username             string
	password             string
	from                 string
	useTLS               bool // implicit TLS (usually 465)
	useStartTLS          bool // STARTTLS upgrade (usually 587)
	insecureSkipVerify   bool
	connectTimeout       time.Duration
	serverNameForTLS     string
	defaultToDomainHeur  string
}

func NewEmailServiceFromEnv() (*EmailService, error) {
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	if host == "" {
		return nil, errors.New("SMTP_HOST is required")
	}

	port := 587
	if v := strings.TrimSpace(os.Getenv("SMTP_PORT")); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			port = p
		}
	}

	from := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	if from == "" {
		return nil, errors.New("SMTP_FROM is required")
	}

	useTLS := parseBoolEnv("SMTP_USE_TLS", false)
	useStartTLS := parseBoolEnv("SMTP_USE_STARTTLS", true)
	insecureSkipVerify := parseBoolEnv("SMTP_INSECURE_SKIP_VERIFY", false)

	username := strings.TrimSpace(os.Getenv("SMTP_USERNAME"))
	password := os.Getenv("SMTP_PASSWORD")

	serverName := strings.TrimSpace(os.Getenv("SMTP_TLS_SERVER_NAME"))
	if serverName == "" {
		serverName = host
	}

	connectTimeout := 10 * time.Second
	if v := strings.TrimSpace(os.Getenv("SMTP_CONNECT_TIMEOUT_SECONDS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			connectTimeout = time.Duration(n) * time.Second
		}
	}

	return &EmailService{
		host:               host,
		port:               port,
		username:           username,
		password:           password,
		from:               from,
		useTLS:             useTLS,
		useStartTLS:        useStartTLS,
		insecureSkipVerify: insecureSkipVerify,
		connectTimeout:     connectTimeout,
		serverNameForTLS:   serverName,
	}, nil
}

func parseBoolEnv(key string, defaultVal bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return defaultVal
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return defaultVal
	}
	return b
}

func (s *EmailService) Send(to string, subject string, textBody string, attachments []EmailAttachment) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return errors.New("recipient email is required")
	}

	msg, err := buildMIMEMessage(s.from, to, subject, textBody, attachments)
	if err != nil {
		return err
	}

	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	dialer := net.Dialer{Timeout: s.connectTimeout}
	var conn net.Conn

	if s.useTLS {
		tlsConn, err := tls.DialWithDialer(&dialer, "tcp", addr, &tls.Config{
			ServerName:         s.serverNameForTLS,
			InsecureSkipVerify: s.insecureSkipVerify,
		})
		if err != nil {
			return fmt.Errorf("smtp tls dial failed: %w", err)
		}
		conn = tlsConn
	} else {
		c, err := dialer.Dial("tcp", addr)
		if err != nil {
			return fmt.Errorf("smtp dial failed: %w", err)
		}
		conn = c
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return fmt.Errorf("smtp client init failed: %w", err)
	}
	defer client.Close()

	if s.useStartTLS && !s.useTLS {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{
				ServerName:         s.serverNameForTLS,
				InsecureSkipVerify: s.insecureSkipVerify,
			}); err != nil {
				return fmt.Errorf("smtp starttls failed: %w", err)
			}
		}
	}

	if s.username != "" {
		auth := smtp.PlainAuth("", s.username, s.password, s.host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth failed: %w", err)
		}
	}

	if err := client.Mail(s.from); err != nil {
		return fmt.Errorf("smtp MAIL FROM failed: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA failed: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		_ = w.Close()
		return fmt.Errorf("smtp write failed: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp data close failed: %w", err)
	}

	_ = client.Quit()
	return nil
}

func buildMIMEMessage(from string, to string, subject string, textBody string, attachments []EmailAttachment) ([]byte, error) {
	var buf bytes.Buffer

	// Basic headers
	buf.WriteString(fmt.Sprintf("From: %s\r\n", from))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", to))
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", encodeHeaderIfNeeded(subject)))
	buf.WriteString("MIME-Version: 1.0\r\n")

	if len(attachments) == 0 {
		buf.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n")
		buf.WriteString("Content-Transfer-Encoding: 8bit\r\n")
		buf.WriteString("\r\n")
		buf.WriteString(textBody)
		if !strings.HasSuffix(textBody, "\n") {
			buf.WriteString("\n")
		}
		return buf.Bytes(), nil
	}

	mw := multipart.NewWriter(&buf)
	boundary := mw.Boundary()
	buf.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n", boundary))
	buf.WriteString("\r\n")

	// Text part
	textHeader := textproto.MIMEHeader{}
	textHeader.Set("Content-Type", "text/plain; charset=\"utf-8\"")
	textHeader.Set("Content-Transfer-Encoding", "8bit")
	textPart, err := mw.CreatePart(textHeader)
	if err != nil {
		return nil, err
	}
	if _, err := textPart.Write([]byte(textBody)); err != nil {
		return nil, err
	}
	if !strings.HasSuffix(textBody, "\n") {
		if _, err := textPart.Write([]byte("\n")); err != nil {
			return nil, err
		}
	}

	for _, a := range attachments {
		ct := strings.TrimSpace(a.ContentType)
		if ct == "" {
			ct = "application/octet-stream"
		}

		encodedName := mime.QEncoding.Encode("utf-8", a.Filename)
		h := textproto.MIMEHeader{}
		h.Set("Content-Type", fmt.Sprintf("%s; name=\"%s\"", ct, encodedName))
		h.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", encodedName))
		h.Set("Content-Transfer-Encoding", "base64")

		p, err := mw.CreatePart(h)
		if err != nil {
			return nil, err
		}

		b64 := base64.StdEncoding.EncodeToString(a.Data)
		// RFC 2045 suggests 76 chars per line
		for len(b64) > 76 {
			if _, err := p.Write([]byte(b64[:76] + "\r\n")); err != nil {
				return nil, err
			}
			b64 = b64[76:]
		}
		if len(b64) > 0 {
			if _, err := p.Write([]byte(b64 + "\r\n")); err != nil {
				return nil, err
			}
		}
	}

	if err := mw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeHeaderIfNeeded(s string) string {
	// Very small helper: if ASCII-only, return as-is.
	for _, r := range s {
		if r > 127 {
			return mime.QEncoding.Encode("utf-8", s)
		}
	}
	return s
}
